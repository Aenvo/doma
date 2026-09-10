import { defineConfig, loadEnv } from 'vite';
import { getViteAliases, getBuildEdition } from './scripts/vite-shared.mjs';


// export default config
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mergedEnv = { ...process.env, ...env };
  const OUTPUT_DIR = env.VITE_OUTPUT_DIR;
  const BUILD_TYPE = env.BUILD_TYPE;
  const BUILD_EDITION = getBuildEdition(mergedEnv);
  const NODE_ENV = process.env.NODE_ENV;
  const isDev = NODE_ENV === 'development' || BUILD_TYPE === 'dev';
  console.log("isDev----", isDev, "edition=", BUILD_EDITION);
  return {
    plugins: [],
    base: './',
    build: {
      minify: isDev ? false : "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      copyPublicDir: false, 
      target: 'esnext', // 保持现代语法
      commonjsOptions: {
        transformMixedEsModules: true,
        esmExternals: true,
        ignoreDynamicRequires: true,
        dynamicRequireTargets: []
      },
      rollupOptions: {
        onwarn(warning, warn) {
          // 忽略 mime externalized 警告
          if (
            warning.message?.includes('Module "fs" has been externalized') ||
            warning.message?.includes('Module "path" has been externalized') ||
            warning.message?.includes('Module "node:')
          ) {
            return;
          }
          warn(warning); // 其他警告照常显示
        },
        input: {
          'service-worker': 'src/resources/source/service-worker.ts',
        },
        output: {
          // format: 'es',
          // format: 'iife',
          entryFileNames: '[name].js', // 保持原文件名
          inlineDynamicImports: true,
          // manualChunks: undefined,
          // manualChunks: () => 'dummy',
          // globals: {} // 不映射任何全局变量
        },
        preserveEntrySignatures: 'strict',
      },
      outDir: `${OUTPUT_DIR}/service`, // 指定输出目录
      emptyOutDir: true, // 清空输出目录
      
    },
    // define: {
    //   // 定义全局变量，用于替换import.meta.url
    //   'import.meta.url': 'self.location'
    // },
    resolve: {
      alias: getViteAliases(__dirname, mergedEnv),
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    },
  }
})