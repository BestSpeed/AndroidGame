#!/usr/bin/env node
'use strict';
// تولید کانفیگ نهفته کلاینت از روی پوشهٔ configs/ — منبع واحد حقیقت برای حالت آفلاین.
// خروجی: client/js/configs.generated.js  (اجرا: npm run build:configs)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = path.join(ROOT, 'configs');
const out = {};
for (const f of fs.readdirSync(dir).sort()) {
  if (!f.endsWith('.json')) continue;
  out[f.replace('.json', '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}
const banner = `// ⚠️ تولیدشده با: npm run build:configs — دستی تغییر ندهید.\n// منبع: پوشهٔ configs/ (کانفیگ‌های Data-Driven سرور و کلاینت مشترک‌اند)\n`;
const file = path.join(ROOT, 'client', 'js', 'configs.generated.js');
fs.writeFileSync(file, banner + 'export const CONFIGS = ' + JSON.stringify(out, null, 1) + ';\n');
console.log('✅', path.relative(ROOT, file), `(${(fs.statSync(file).size / 1024).toFixed(1)}KB)`);
