import { resolve } from 'path';

/** Open 仓固定 open；Pro overlay 会覆盖本文件以恢复双轨 */
export function getBuildEdition(_env = process.env) {
  return 'open';
}

/**
 * IDE / tsc paths（Open 单轨：无 *.open/*.pro alias）
 */
export function getEditionTsconfigPaths(_env = process.env) {
  return {
    '@/*': ['src/*'],
  };
}

export function getViteAliases(rootDir, _env = process.env) {
  return [
    { find: '@', replacement: resolve(rootDir, 'src') },
    { find: '~', replacement: resolve(rootDir, 'src') },
  ];
}
