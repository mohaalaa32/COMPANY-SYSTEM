#!/usr/bin/env node
/**
 * Brand guard: fails if a forbidden legacy company name appears anywhere in the repo.
 * The forbidden strings are built from char codes so this file never contains them literally.
 * Run: pnpm check:brand
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const fromCodes = (codes) => String.fromCharCode(...codes);
// "تقنية" + " " + "بغداد" / "العراق"
const TAQNIA = fromCodes([0x062a, 0x0642, 0x0646, 0x064a, 0x0629]);
const FORBIDDEN = [
  `${TAQNIA} ${fromCodes([0x0628, 0x063a, 0x062f, 0x0627, 0x062f])}`,
  `${TAQNIA} ${fromCodes([0x0627, 0x0644, 0x0639, 0x0631, 0x0627, 0x0642])}`,
];

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.turbo',
  'playwright-report', 'test-results', '.venv', '__pycache__', 'design',
]);
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|prisma|sql|css|html|py|yml|yaml|toml|txt|env|example)$/i;

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full);
    } else if (TEXT_EXT.test(name) && st.size < 2_000_000) {
      const text = readFileSync(full, 'utf8');
      for (const bad of FORBIDDEN) {
        if (text.includes(bad)) hits.push(relative(ROOT, full));
      }
    }
  }
}
walk(ROOT);

if (hits.length) {
  console.error('✖ Forbidden legacy brand name found in:\n  ' + [...new Set(hits)].join('\n  '));
  console.error('Use config/brand.ts instead.');
  process.exit(1);
}
console.log('✔ brand check passed (design/ reference screenshots are excluded by design).');
