const fs = require('fs');
const path = process.argv[2];
const content = fs.readFileSync(path, 'utf8');
const events = [];
const openRe = /<div\b[^>]*>/gs;
const closeRe = /<\/div>/g;
let m;
while ((m = openRe.exec(content)) !== null) {
  if (m[0].endsWith('/>')) continue;
  events.push({ pos: m.index, type: 'open' });
}
while ((m = closeRe.exec(content)) !== null) {
  events.push({ pos: m.index, type: 'close' });
}
events.sort((a, b) => a.pos - b.pos);
let depth = 0;
const lines = content.split('\n');
const lineOffsets = [0];
let totalLen = 0;
for (let i = 0; i < lines.length; i++) {
  totalLen += lines[i].length + 1;
  lineOffsets.push(totalLen);
}
function lineForPos(pos) {
  for (let i = 0; i < lineOffsets.length; i++) {
    if (lineOffsets[i] > pos) return i;
  }
  return lineOffsets.length;
}
for (const ev of events) {
  const lineNum = lineForPos(ev.pos);
  if (ev.type === 'open') depth++;
  else depth--;
  if (depth < 0) {
    console.log(`UNBALANCED at line ${lineNum}: depth=${depth}, event=${ev.type}`);
  }
}
console.log('Final depth:', depth);
