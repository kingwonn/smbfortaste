#!/usr/bin/env node
'use strict';
// 研发看板:board/cards.json 是唯一账本,本脚本是 gate 与视图。
//   node tools/board.js check         gate:账本自洽 + 腿都在 + 全量测试绿 + 测试数不减 + 无 NUL 字节
//   node tools/board.js check --bump  测试数增加时把棘轮下限一并抬高(只升不降)
//   node tools/board.js html          跑一遍 gate,生成 board/board.html(看板页面,只是视图)

const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LEDGER = path.join(ROOT, 'board/cards.json');
const RATCHET = path.join(ROOT, 'board/ratchet.json');
const TEMPLATE = path.join(ROOT, 'board/template.html');
const OUT = path.join(ROOT, 'board/board.html');
const SUITES = ['app/core/test/*.test.js', 'app/server/test/*.test.js', 'app/watcher/test/*.test.js'];
const LEG_TYPES = new Set(['test', 'browser', 'shop', 'doc', 'todo']);

const rel = (p) => path.join(ROOT, p);

function lintLedger(board) {
  const problems = [];
  const ids = new Set();
  for (const c of board.cards) {
    const where = `${c.id}「${c.title}」`;
    if (ids.has(c.id)) problems.push(`${c.id} 编号重复`);
    ids.add(c.id);
    if (!board.lanes.includes(c.lane)) problems.push(`${where}:泳道"${c.lane}"不在 lanes 里`);
    if (!board.statuses[c.status]) problems.push(`${where}:状态"${c.status}"不认识`);
    const legs = c.legs || [];
    if (c.status === 'done' && legs.length === 0) problems.push(`${where}:标了完成却没有任何验收腿`);
    if (c.status === 'done' && legs.some((l) => l.t === 'todo')) problems.push(`${where}:标了完成,但还有没写的腿`);
    if (c.status === 'blocked' && !c.who) problems.push(`${where}:卡住了,但没写等谁`);
    for (const l of legs) {
      if (!LEG_TYPES.has(l.t)) { problems.push(`${where}:腿类型"${l.t}"不认识`); continue; }
      if (l.t === 'test') {
        if (!fs.existsSync(rel(l.file))) { problems.push(`${where}:测试文件不存在 ${l.file}`); continue; }
        const src = fs.readFileSync(rel(l.file), 'utf8');
        const names = [...src.matchAll(/^\s*test\('([^']+)'/gm)].map((m) => m[1]);
        if (!names.some((n) => n.includes(l.name))) problems.push(`${where}:${l.file} 里找不到测试"${l.name}"`);
      }
      if (l.t === 'doc' && !fs.existsSync(rel(l.file))) problems.push(`${where}:文档不存在 ${l.file}`);
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function nulBytes() { // LESSONS L2
  const files = walk(rel('app')).filter((f) => /\.(js|html)$/.test(f));
  return files.filter((f) => fs.readFileSync(f).includes(0)).map((f) => path.relative(ROOT, f));
}

function runTests() {
  if (!fs.existsSync(rel('app/server/node_modules'))) { // LESSONS L6
    return { env: '服务层依赖没装:先跑 cd app/server && npm install,再跑 gate(这是环境问题,不是代码问题)' };
  }
  const r = spawnSync(process.execPath, ['--test', ...SUITES], { cwd: ROOT, encoding: 'utf8' });
  const num = (k) => Number((new RegExp(`^# ${k} (\\d+)`, 'm').exec(r.stdout) || [])[1] || 0);
  const failed = [...r.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { pass: num('pass'), fail: num('fail'), failed };
}

function gate({ bump = false } = {}) {
  const board = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
  const ratchet = JSON.parse(fs.readFileSync(RATCHET, 'utf8'));
  const problems = lintLedger(board);
  const nul = nulBytes();
  nul.forEach((f) => problems.push(`${f} 里有 NUL 字节(LESSONS L2)`));
  const tests = runTests();
  if (tests.env) problems.push(tests.env);
  else {
    if (tests.fail > 0) problems.push(`测试有 ${tests.fail} 项没过:${tests.failed.join(';')}`);
    if (tests.pass < ratchet.minTests) problems.push(`测试数从 ${ratchet.minTests} 掉到 ${tests.pass}:门槛只紧不松,删测试要先在 LESSONS 里说明理由`);
    if (bump && tests.fail === 0 && tests.pass > ratchet.minTests) {
      ratchet.minTests = tests.pass;
      fs.writeFileSync(RATCHET, JSON.stringify(ratchet, null, 2) + '\n');
    }
  }
  const real = board.cards.filter((c) => c.lane === '真实验证');
  return { board, ratchet, tests, problems, real, green: problems.length === 0 };
}

function lessons() {
  const src = fs.readFileSync(rel('LESSONS.md'), 'utf8');
  return [...src.matchAll(/^## (L\d+) (.+)$/gm)].map((m) => ({ id: m[1], title: m[2] }));
}

function git(cmd) { try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return ''; } }

function report(g) {
  const by = {};
  for (const c of g.board.cards) by[c.status] = (by[c.status] || 0) + 1;
  console.log(`账本:${g.board.cards.length} 张卡 · ` + Object.entries(g.board.statuses).map(([k, v]) => `${v} ${by[k] || 0}`).join(' · '));
  if (!g.tests.env) console.log(`测试:通过 ${g.tests.pass},失败 ${g.tests.fail},棘轮下限 ${g.ratchet.minTests}`);
  const realOpen = g.real.filter((c) => c.status !== 'done');
  if (realOpen.length) console.log(`真实验证未完成 ${realOpen.length} 项(LESSONS L7):` + realOpen.map((c) => `${c.id} 等${c.who}`).join(','));
  const manualOnly = g.board.cards.filter((c) => c.status === 'done' && c.legs.every((l) => l.t !== 'test'));
  if (manualOnly.length) console.log(`只有人工验证的完成项 ${manualOnly.length} 张:` + manualOnly.map((c) => c.id).join(','));
  if (g.green) console.log('gate:绿'); else { console.log('gate:红'); g.problems.forEach((p) => console.log('  ✕ ' + p)); }
}

function html(g) {
  const data = {
    board: g.board,
    gate: { green: g.green, problems: g.problems, tests: g.tests, minTests: g.ratchet.minTests },
    lessons: lessons(),
    commit: git('rev-parse --short HEAD'),
    branch: git('rev-parse --abbrev-ref HEAD'),
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  };
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  fs.writeFileSync(OUT, tpl.replace('/*__BOARD_DATA__*/null', json));
  console.log(`看板页面已生成:${path.relative(ROOT, OUT)}`);
}

const [cmd, flag] = process.argv.slice(2);
if (cmd === 'check') {
  const g = gate({ bump: flag === '--bump' });
  report(g);
  process.exit(g.green ? 0 : 1);
} else if (cmd === 'html') {
  const g = gate();
  report(g);
  html(g);
} else {
  console.log('用法:node tools/board.js check [--bump] | html');
  process.exit(2);
}
