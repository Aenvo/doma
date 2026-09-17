/**
 * 按 VITE_BUILD_EDITION 写出 tsconfig.edition.json，让 IDE「转到定义」跟版别走。
 * 用法：VITE_BUILD_EDITION=open|pro node scripts/sync-edition-tsconfig.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBuildEdition, getEditionTsconfigPaths } from './vite-shared.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const edition = getBuildEdition(process.env);
const outPath = resolve(rootDir, 'tsconfig.edition.json');

const doc = {
  compilerOptions: {
    baseUrl: '.',
    paths: getEditionTsconfigPaths(process.env),
  },
};

writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
console.log(`[sync-edition-tsconfig] edition=${edition} → ${outPath}`);
