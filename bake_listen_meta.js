// 从懒笔记四级页面抓取官方听力分片，重新生成 listeningMeta.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const vm = require('vm');

const UA = { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } };
function fetch(url, redirects) {
  redirects = redirects || 0;
  return new Promise((resolve, reject) => {
    https.get(url, UA, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
        res.resume();
        return resolve(fetch(res.headers.location.startsWith('http') ? res.headers.location : 'https://english-exam.lazynote.cn' + res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// RSC 线格式还原：[0,x]→x，[1,[...]]→数组
function rsc(v) {
  if (Array.isArray(v) && typeof v[0] === 'number') {
    if (v[0] === 1) return (v[1] || []).map(rsc);
    return rsc(v[1]);   // [0, x] 解包后仍需递归（x 可能是嵌套对象）
  }
  if (Array.isArray(v)) return v.map(rsc);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = rsc(v[k]);
    return o;
  }
  return v;
}

function extractPieces(html) {
  // props="{&quot;src&quot;: ... }" 直到第一个未转义引号（后跟 ssr client）
  const marker = 'props="{&quot;src&quot;:';
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = i + 'props="'.length;
  const end = html.indexOf('" ssr client=', start);
  if (end < 0) return null;
  const raw = html.slice(start, end)
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return { error: 'JSON解析失败: ' + e.message }; }
  return rsc(parsed);
}

(async () => {
  // 卷列表：从 meta.js 读
  const sb = { window: {} };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'bank', 'meta.js'), 'utf8'), sb);
  const sets = sb.window.CET4_META.order.slice();

  const out = {};
  const noPlayer = [], failed = [];
  let n = 0;
  for (const s of sets) {
    n++;
    try {
      const html = await fetch('https://english-exam.lazynote.cn/cet4/paper/' + s + '/');
      const data = extractPieces(html);
      if (!data) { noPlayer.push(s); console.log('[' + n + '/' + sets.length + '] 无播放器', s); }
      else if (data.error) { failed.push(s + ' ' + data.error); console.log('[' + n + '/' + sets.length + '] 解析失败', s, data.error); }
      else {
        out[s] = {
          src: data.src,
          pieces: (data.pieces || []).map(p => ({ label: p.label, start: p.start, end: p.end }))
        };
        console.log('[' + n + '/' + sets.length + '] OK', s, out[s].pieces.length, '片', data.src.split('/').slice(-2)[0]);
      }
    } catch (e) {
      failed.push(s + ' ' + e.message);
      console.log('[' + n + '/' + sets.length + '] FAIL', s, e.message);
    }
    await sleep(250);
  }

  // 写 listeningMeta.js（与现有格式一致）
  const body = '(function(){var M=' + JSON.stringify(out) +
    ';(typeof window!==\'undefined\'?window:self).CET4_LISTEN_META=M;})();\n';
  fs.writeFileSync(path.join(__dirname, '..', 'app', 'bank', 'listeningMeta.js'), body, 'utf8');

  console.log('\n=== 汇总 ===');
  console.log('成功卷数:', Object.keys(out).length);
  console.log('无播放器(共用/缺听力):', noPlayer.length, noPlayer.join(','));
  console.log('失败:', failed.length, failed.join(';'));
})();
