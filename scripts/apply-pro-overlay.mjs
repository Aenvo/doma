#!/usr/bin/env node
/**
 * Apply private ./pro overlay onto this Open tree (in-place).
 * ./pro is gitignored — open-source contributors never have it.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pro = join(root, 'pro');

const SKIP = new Set([
  '.git',
  '.gitignore',
  '.gitmodules',
  'README.md',
  'package.json',
  'CONTEXT.md',
  'node_modules',
  'dist',
  'core',
]);

if (!existsSync(pro)) {
  console.error(`[apply-pro] missing ${pro}`);
  console.error(
    '[apply-pro] Place the private overlay at ./pro (gitignored), then re-run. Open contributors can ignore this script.',
  );
  process.exit(1);
}

function copyTree(srcDir, destRoot, rel = '') {
  const dir = rel ? join(srcDir, rel) : srcDir;
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const relPath = rel ? `${rel}/${name}` : name;
    const from = join(srcDir, relPath);
    const to = join(destRoot, relPath);
    if (statSync(from).isDirectory()) {
      mkdirSync(to, { recursive: true });
      copyTree(srcDir, destRoot, relPath);
    } else {
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
  }
}

copyTree(pro, root);
console.log('[apply-pro] ./pro → Open root done');
