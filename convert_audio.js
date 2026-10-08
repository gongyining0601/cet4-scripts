// Extract distinct audio IDs from listeningMeta.js and emit a conversion list
const fs = require('fs');
const path = require('path');

const appDir = process.argv[2];          // e.g. D:/CET4/app
const outDir = process.argv[3];          // e.g. D:/CET4/cet-audio/cet4
const src = fs.readFileSync(path.join(appDir, 'bank/listeningMeta.js'), 'utf8');
const m = src.match(/=\s*(\{[\s\S]*\})\s*;/);
const data = JSON.parse(JSON.stringify(eval('(' + m[1] + ')')));

const ids = new Set();
for (const k of Object.keys(data)) {
  const u = data[k] && data[k].src;
  const mm = u && u.match(/listening\.lazynote\.cn\/(cet[46])\/(\d+)\/index\.m3u8/);
  if (mm) ids.add(mm[2]);
}
const list = [...ids].filter(id => !fs.existsSync(path.join(outDir, id + '.m4a')));
console.log(list.join(' '));
console.error(`total=${ids.size} todo=${list.length}`);
