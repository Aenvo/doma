/// <reference types="vite/client" />
/**
 * 为了在 Vue 单文件组件（.vue 文件）中获得 TypeScript 类型支持
 */ 
declare module '*.vue' {
  // 从 vue 库中导入 DefineComponent 类型，用于定义组件类型
  import type { DefineComponent } from 'vue';
  /**
   * 定义一个常量 component，其类型为 DefineComponent
   * 第一个泛型参数 {} 表示组件没有定义 props
   * 第二个泛型参数 {} 表示组件没有定义 data
   * 第三个泛型参数 any 表示组件的返回值类型不做具体限制
   */
  const component: DefineComponent<{}, {}, any>;
  // 将 component 常量作为默认导出
  export default component;
}


interface ImportMetaEnv {
  readonly VITE_OUTPUT_DIR: string;
  readonly VITE_API_URL: string;
  readonly VITE_STAY_EXTENSION_BROWSER_NAME: string;
  readonly VITE_BUILD_EDITION?: 'open' | 'pro';
  // 添加其他环境变量
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.less' {
  const content: string;
  export default content;
}
// vite-svg-loader 虽然能将 SVG 转换为 Vue 组件，但 TypeScript 默认仍认为 .svg 文件导出的类型是 string
declare module '*.svg' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
