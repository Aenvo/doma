

import type { PluginOption } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

const TitleConfig:Record<string, { title: string; description: string }> = {
  options: {
    title: "stay extension userscript manager",
    description: "stay extension userscript manager"
  },
  popup: {
    title: "stay extension popup",
    description: "stay extension popup"
  },
  workspace: {
    title: "DomA Workspace",
    description: "DomA workspace file manager"
  },

};

// 定义页面配置的类型
interface PageConfig {
  entry: string;
  filename: string;
  templatePath: string;
  description: string;
  title: string;
}


const isPage = (dir:string) => {
  // Vue pages need App.vue + main.ts + index.html
  if (!fs.existsSync(dir + "/main.ts") || !fs.existsSync(dir + "/index.html")) {
    return false;
  }
  return fs.existsSync(dir + "/App.vue");
}


// 读取 public/index.html 作为模板
const hmrTemplate = fs.readFileSync(resolve('src/pages/hmr_template.html'), 'utf-8');


// 动态获取 pages 目录下的页面
const pagesDir = 'src/pages'; //resolve('src/pages');
const pages = fs.readdirSync(pagesDir).reduce((configs:Record<string, PageConfig>, page:string) => {
  // const pagePath = resolve(pagesDir, page);
  // console.log("page-----:", page);
  const pagePath = `${pagesDir}/${page}`;
  if (fs.statSync(pagePath).isDirectory()) {
    if(isPage(pagePath)){
      if(configs[page]){
        throw new Error("有名字重复的页面:" + page);
      }
      // 使用类型断言确保可以通过字符串索引访问 TitleConfig
      const title = TitleConfig[page]?.title || `${page} - My App`;
      const description = TitleConfig[page]?.description || `${page} - My App`;
      const entry = `${pagePath}/main.ts`; // resolve(pagePath, 'main.ts'); // 指定入口文件
      // const typedAcc: Record<string, PageConfig> = configs as Record<string, PageConfig>;
      configs[page] = {
        title: title,
        description: description,
        templatePath: `${pagePath}/index.html`,
        entry: entry,
        filename: `${page}/index.html`, // 输出文件名
      };
    }else{
      console.log("not page:" + page);
    }
  }
  return configs;
}, {} as Record<string, PageConfig>);

export const inputPageConfig = Object.keys(pages).reduce((acc, page) => {
  // 明确指定 acc 的类型为 Record<string, string>
  const pageMap: Record<string, string> = acc as Record<string, string>;
  pageMap[page] = pages[page].templatePath
  return acc;
}, {});

export const createHMRPlugin = (): PluginOption => {
  return {
    name: 'vite-plugin-hmr-html',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const page = req.url?.split('/')[1]; // 获取页面名称
        // console.log("page---");
        if (page && pages[page]) {
          const pageObj = pages[page];
          const entry = resolve(`${pageObj.entry}`);
          // console.log("page---", page, generatePages(), entry);
          const html = hmrTemplate
          .replace(/<%- title %>/, pageObj.title)
          .replace(/<%- description %>/, pageObj.description)
          .replace(/<%- entry %>/g, entry);
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        } else {
          next();
        }
      });
    },
    
  };
}



export const createFlatHtmlPlugin = (): PluginOption => {
  return {
    name: 'flat-html-generator',
    generateBundle(options, bundle:any) {
      // console.log("generateBundle---options---", options, bundle);
      for (const key in bundle) {
        if (key.endsWith('.html') && bundle[key].type === 'asset') {
          // console.log("generateBundle---options---", options, bundle);
          let newKey = key.replace("src/pages/", "");
          let newBundle = bundle[key];
          newBundle.fileName = newKey;
          if (typeof newBundle.source === 'string') {
            const pageName = newKey.split("/")[0];
            const pageObj = pages[pageName];
            newBundle.source = newBundle.source.replace(/..\/..\/..\//g, '../')
                                              .replace(/<%- description %>/g, pageObj.description)
                                              .replace(/<%- title %>/g, pageObj.title);

          }
          bundle[newKey] = newBundle;

          delete bundle[key]
        }
      }
    }
  }
}



