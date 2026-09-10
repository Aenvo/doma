import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import { inputPageConfig, createHMRPlugin, createFlatHtmlPlugin } from './src/config/page.config';
import { inputSourceConfig, copyFilesConfig } from './src/config/source.config';
import svgLoader from 'vite-svg-loader';
import type { OutputOptions } from 'rollup'
import { getBuildEdition, getViteAliases } from './scripts/vite-shared.mjs';


export default defineConfig(({mode})=>{
  const env = loadEnv(mode, process.cwd(), '');
  const mergedEnv = { ...process.env, ...env };
  const OUTPUT_DIR = env.VITE_OUTPUT_DIR;
  const PLATFORM_NAME = env.VITE_STAY_EXTENSION_PLATFORM_NAME;
  const BROWSER_NAME = env.VITE_STAY_EXTENSION_BROWSER_NAME;
  const BUILD_TYPE = env.BUILD_TYPE;
  const BUILD_EDITION = getBuildEdition(mergedEnv);
  const NODE_ENV = process.env.NODE_ENV;
  console.log("start build----OUTPUT_DIR=",OUTPUT_DIR, mode, BROWSER_NAME, "edition=", BUILD_EDITION);
  
  const inputSourceMap = inputSourceConfig(PLATFORM_NAME, BROWSER_NAME, BUILD_EDITION);
  const inputSourceKeys = Object.keys(inputSourceMap);
  // console.log("input source config----", inputSourceMap);
  const isDev = NODE_ENV === 'development' || BUILD_TYPE === 'dev';
  console.log("isDev----", isDev);
  const copyFilesTargets = copyFilesConfig(OUTPUT_DIR, PLATFORM_NAME, BROWSER_NAME, BUILD_EDITION);
  const isWatch = process.argv.includes('--watch');
  // console.log("isWatch----", copyFilesTargets, isWatch);

  return {
    plugins: [
      vue({
        template: {
          compilerOptions: {
            // 自定义编译器选项
          }
        },
        include: [/\.vue$/, /\.md$/], 
      }),
      svgLoader(),
      createHMRPlugin(),
      viteStaticCopy({
        targets: copyFilesTargets,
        // 晚于 publicDir 拷贝，确保 favicon 以 src/assets/favicon.ico 为准
        hook: 'closeBundle',
      }),
    ],
    base: './',
    resolve: {
      alias: getViteAliases(__dirname, mergedEnv),
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    },
    publicDir: resolve(__dirname, 'public'),
    build: {
      minify: isDev ? false : "terser",
      terserOptions: {
        compress: {
          drop_console: true,
          pure_funcs: ['console.log']
        }
      },
      commonjsOptions: {
        transformMixedEsModules: true
      },
      target: 'esnext', // 保持现代语法
      // worker: {
      //   format: 'es',
      //   rollupOptions: {
      //     plugins: [],
      //     resolve: {
      //       alias: {
      //         '@': resolve(__dirname, 'src'),
      //       }
      //     }
      //   }
      // },
      outDir: OUTPUT_DIR,
      emptyOutDir: isDev ? false : true,
      rollupOptions: {
        input: {
          ...inputPageConfig,
          ...inputSourceMap,
        },
        output: {
          plugins: [
            createFlatHtmlPlugin()
          ] as OutputOptions['plugins'],
          //entryFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: (chunkInfo)=>{
            // entryFileNames 用于定义入口文件（也就是应用程序的初始加载文件）的输出文件名。
            // 入口文件通常是在 rollupOptions.input 中指定的文件。
            if (inputSourceKeys.some((input: string) => chunkInfo.facadeModuleId?.includes(input))) {
              return '[name].js';
            }else {
              // 非指定路径下的文件，保持原逻辑
              return 'assets/js/[name]-[hash].js';
            }
          },
          // chunkFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'vendor') return 'assets/js/vendor-[hash].js'
            return 'assets/js/[name]-[hash].js'
          },
          assetFileNames: (assetInfo): string => {
            // console.log("assetInfo-------", assetInfo);
            
            const assetNames = assetInfo.names as Array<string>;
            const assetName = (assetNames.length && assetNames[0] ) || '';
            const extType = assetName.split('.').pop()?.toLowerCase() ?? ''
            
            const dirMap: Record<string, string> = {
              png: 'images',
              jpg: 'images',
              jpeg: 'images',
              svg: 'images',
              gif: 'images',
              webp: 'images',
              woff: 'fonts',
              woff2: 'fonts',
              eot: 'fonts',
              ttf: 'fonts',
              otf: 'fonts',
              css: 'css',
              less: 'css',
              scss: 'css',
            }
            const dir = dirMap[extType] || 'css'
            // console.log("extType, dir----", extType, dir);
            // if (extType == "css") {
            //   return `assets/${dir}/vendor.[hash][extname]`
            // }
            return `assets/${dir}/[name].[hash][extname]`
          },
          manualChunks(id) {
            // content script 入口须单文件；html2canvas 不能拆到 vendor
            if (id.includes('html2canvas')) return undefined;
            // 只要是第三方依赖（node_modules），都打到一个 vendor.js 中
            if (id.includes('node_modules')) {
              if (id.includes('codemirror')) return 'codemirror';
              // Excel 导出按需加载，避免打进首屏 vendor
              if (id.includes('xlsx')) return 'xlsx';
              return 'vendor'
            }
            // if (id.includes('worker')) {
            //   return 'options'; // 和 options 页面打包在同一个文件
            // }
            if (id.includes('i18n')) {
              return "vendor";
            }
            return undefined;
            // 其他情况走默认逻辑，不拆 i18n
          },
          // manualChunks: undefined, // ✅ 不拆包
        },
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
        // external: isWatch ? [/ffmpeg-core.worker\.js$/] : [],
      },
      watch: isWatch ? {
        clearScreen: false,
        include: ['src/**'],
        // exclude: ['node_modules/*', '**/ffmpeg/**', '**/ffmpeg-core*.js', "@ffmpeg/ffmpeg"]
      } : null,
    },
    // define: {
    //   // 定义全局变量，用于替换import.meta.url
    //   'import.meta.url': 'self.location'
    // },
    css: {
      preprocessorOptions: {
        less: {
          modifyVars: {
            edition: 'open',
          },
          javascriptEnabled: true, // 启用内联 JavaScript
        }
      },
      modules: {
        localsConvention: 'camelCaseOnly' as const,
      },
      postcss: {
        
      }
    },
    optimizeDeps: {
      include: ['vue', 'mux.js', 'mp4box'],
      exclude: ['fs', 'path', 'os'],
      esbuildOptions: {
        loader: {
          '.ts': 'tsx'
        }
      }
    },
    esbuild: {
      loader: 'tsx',
      include: /src\/.*\.tsx?$/,
      exclude: []
    },
    server: {
      port: 4000,
      headers: {
        "Access-Control-Allow-Origin": "*",
        'Content-Security-Policy': `style-src 'nonce-random' 'self'`,
      },
      // open: 'options/index.html', // 默认打开页面
      proxy: {
        "/v1/stay": {
          // target: "https://api.staybrowser.com", //请求对象
          target: "http://172.16.0.27:10000",
          ws: false, //代理websocked
          changeOrigin: true, // //用于控制请求头中的host值
          secure: true, //target是否为https接口
          // pathRewrite: { "^/stay-fork": "" }, //将所有含//stay-fork路径的，去掉/stay-fork转发给服务器
        },
      },
    }
  }
})