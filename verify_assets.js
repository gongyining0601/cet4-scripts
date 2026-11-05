/* scripts/verify_assets.js —— 顶层素材与题库副本一致性闸门（CET4 专有）
 *
 * 顶层仓库只纳管「结构化题库 + 文档 + 原始卷的 SHA-256 指纹」，545MB 的 pdf/docx 不进 git。
 * 本用例负责盯住三件事：
 *   1) papers/SHA256SUMS.txt 里列出的文件都在、没被改动；
 *   2) bank/json/*.json（转录源）与 app/bank/meta.js（运行时骨架）卷数、题数、逐题 id/type/qno 一致；
 *   3) selfcheck.json 等辅助文件不混进卷清单。
 *
 * 默认抽样校验 10 个文件的哈希（快，进 core 回归）；加 --full 全量校验 229 个文件（发版/归档前跑）。
 * 用法：node scripts/verify_assets.js [--full]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PAPERS = path.join(ROOT, 'papers');
const JSONDIR = path.join(ROOT, 'bank', 'json');
const FULL = process.argv.includes('--full');

let ok = 0, fail = 0;
function chk(name, cond, detail) {
  if (cond) { ok++; console.log('ok   ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL ' + name + (detail ? ' | ' + detail : '')); }
}
function sha256(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  let n;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.slice(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}

// ---------- 1) 原始素材指纹 ----------
const sumPath = path.join(PAPERS, 'SHA256SUMS.txt');
chk('papers/SHA256SUMS.txt 存在', fs.existsSync(sumPath), '');
const entries = fs.existsSync(sumPath)
  ? fs.readFileSync(sumPath, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) {
      const m = /^([a-f0-9]{64})\s+\S.*$/.exec(line);
      return m ? { hash: m[1], name: line.slice(m[1].length).replace(/^\s+/, '') } : null;
    }).filter(Boolean)
  : [];
chk('清单格式可解析（每行 sha256 + 文件名）', entries.length > 0, entries.length + ' 行');
chk('清单覆盖 76 套卷的 pdf/docx 与解析文本', entries.length >= 228, entries.length + ' 个文件');

const missingFiles = entries.filter(function (e) { return !fs.existsSync(path.join(PAPERS, e.name)); });
chk('清单列出的文件全部存在', missingFiles.length === 0, missingFiles.length ? missingFiles.slice(0, 3).map(e => e.name).join(', ') : '');

let picked;
if (FULL) picked = entries;
else {
  const idx = [0, 1, 2, Math.floor(entries.length / 4), Math.floor(entries.length / 2),
    Math.floor(entries.length * 3 / 4), entries.length - 3, entries.length - 2, entries.length - 1];
  picked = idx.map(function (i) { return entries[i]; }).filter(Boolean);
}
let badHash = 0;
picked.forEach(function (e) {
  const p = path.join(PAPERS, e.name);
  if (fs.existsSync(p) && sha256(p) !== e.hash) badHash++;
});
chk((FULL ? '全量' : '抽样') + '哈希校验通过（' + picked.length + ' 个文件）', badHash === 0, badHash + ' 个不匹配');

// ---------- 2) 转录源 ↔ 运行时骨架 ----------
const jsonFiles = fs.readdirSync(JSONDIR).filter(function (f) { return /^\d{4}-\d{2}-\d\.json$/.test(f); }).sort();
chk('bank/json 恰好 76 卷', jsonFiles.length === 76, jsonFiles.length + ' 卷');

let jsonQ = 0;
const byId = {};
jsonFiles.forEach(function (f) {
  const j = JSON.parse(fs.readFileSync(path.join(JSONDIR, f), 'utf8'));
  byId[j.id] = j.questions || [];
  jsonQ += (j.questions || []).length;
});

const sandbox = { window: {}, self: {} };
sandbox.window.window = sandbox.window;
sandbox.self = sandbox.window;
try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'app', 'bank', 'meta.js'), 'utf8'), sandbox); } catch (e) { }
const META = sandbox.window.CET4_META || sandbox.self.CET4_META || null;
chk('app/bank/meta.js 可加载', !!META && Array.isArray(META.order), META ? META.order.length + ' 卷' : '缺失');

if (META) {
  let metaQ = 0, mismatch = 0;
  Object.keys(META.papers || {}).forEach(function (id) {
    const lite = (META.papers[id].qLite || []);
    metaQ += lite.length;
    const src = byId[id];
    if (!src) { mismatch++; return; }
    if (src.length !== lite.length) { mismatch++; return; }
    for (let i = 0; i < lite.length; i++) {
      if (lite[i].id !== src[i].id || lite[i].type !== src[i].type || lite[i].qno !== src[i].qno) { mismatch++; break; }
    }
  });
  chk('meta 骨架卷数与转录源一致', META.order.length === jsonFiles.length, META.order.length + ' / ' + jsonFiles.length);
  chk('题目总数一致（转录源 / 骨架）', jsonQ === metaQ, jsonQ + ' / ' + metaQ);
  chk('逐卷逐题 id/type/qno 完全一致（无漂移）', mismatch === 0, mismatch + ' 卷不一致');
}

console.log('\n===== 素材与题库副本: ' + ok + ' ok / ' + fail + ' fail' + (FULL ? '（全量哈希）' : '（抽样哈希；--full 可全验）') + ' =====');
process.exit(fail ? 1 : 0);
