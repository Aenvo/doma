/**
 * Open 仓：写出极简 tsconfig.edition.json。
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
