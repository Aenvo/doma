import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import svgLoader from 'vite-svg-loader';


export default defineConfig(({mode})=>{
  const env = loadEnv(mode, process.cwd(), '');
  const OUTPUT_DIR = env.VITE_OUTPUT_DIR;
  const BUILD_TYPE = env.BUILD_TYPE;
  const NODE_ENV = process.env.NODE_ENV;
  const isDev = NODE_ENV === 'development' || BUILD_TYPE === 'dev';
  return {
    plugins: [
      vue({
        include: [/\.vue$/, /\.md$/], // 添加这行配置
      }),
      svgLoader(),
      cssInjectedByJsPlugin()
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    css: {
      preprocessorOptions: {
        less: {
          javascriptEnabled: true,
        },
      },
    },
    publicDir: false, // 禁用 public 目录
    build: {
      cssCodeSplit: false, // 禁用 CSS 代码拆分
      minify: isDev ? false : "terser",
      cssMinify: false,
      // sourcemap: true,
      target: 'esnext', // 保持现代语法
      outDir: `${OUTPUT_DIR}/source/search`, // 独立输出目录
      commonjsOptions: {
        transformMixedEsModules: true,
        esmExternals: true
      },
      rollupOptions: {
        input: {
          'search.user': resolve(__dirname,'src/resources/source/search/search.user.ts'),
        },
        // external: ['vue'], // 让 Vue 作为外部依赖，避免重复打包
        output: {
          globals: {
            vue: 'Vue' // 确保Vue作为全局变量使用
          },
          entryFileNames: '[name].js', // 保持原文件名
          inlineDynamicImports: true,
          format: 'iife',
          // interop: 'auto',
          // externalLiveBindings: false
          // noConflict: true // 防止全局变量冲突
        },
      },
      emptyOutDir: false, // 清空输出目录
    }
  }
})