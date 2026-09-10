// src/plugins/custom-modal-plugin.ts
import { createVNode, render } from 'vue';
import type { App, Component } from 'vue';
import Container from './Container.vue';
import CustomConfirm from './Confirm.vue';
import CustomAlert from './Alert.vue';
import { isEdge, isMobile } from "@/utils/device";
import { isMobileLite } from "@/utils/feature";

// 定义插件选项接口
interface CustomModalOptions {
  maskClosable?: boolean;
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

// 定义确认对话框选项接口
interface ConfirmOptions {
  confirmText?: string;
  cancelText?: string;
  maskClosable?: boolean;
  title?: string;
}

// 定义提示对话框选项接口
interface AlertOptions {
  confirmText?: string;
  maskClosable?: boolean;
  title?: string;
}


// 插件实现
const CustomAlertPlugin = {
  install(app: App, options: CustomModalOptions = {}): void {
    // 保存原始的confirm和alert
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    
    console.log("CustomAlertPlugin install isMobile() && isMobileLite()", isMobile() , isEdge(), isMobileLite())

    if(!(isMobile() && isMobileLite())){
      return;
    }
    console.log("CustomAlertPlugin install")
    // 创建模态框容器
    let containerElement: HTMLElement | null = null;
    let modalContainerInstance: any = null;
    
    // 保存插件全局配置
    const pluginOptions = { ...options };

    // 挂载Container组件
    const mountContainer = (): void => {
      if (!containerElement) {
        containerElement = document.createElement('div');
        document.body.appendChild(containerElement);
      }
      
      if (!modalContainerInstance) {
        const vnode = createVNode(Container);
        render(vnode, containerElement);
        modalContainerInstance = vnode.component;
        console.log("CustomAlertPlugin install", modalContainerInstance)
      }
    };

    // 自定义confirm方法
    const customConfirm = async (message: string, opts: ConfirmOptions = {}): Promise<boolean> => {
      // 在不支持的环境下或未初始化完成时回退到原生方法
      // isIOS || 
      console.log("CustomAlertPlugin install customConfirm", modalContainerInstance)
      if (!modalContainerInstance?.exposed) {
        return originalConfirm(message)
      }
      
       // 合并插件配置和调用配置
      const mergedOptions = { ...pluginOptions, ...opts };

      return await modalContainerInstance.exposed.showModal(CustomConfirm, {
            message,
            title: opts.title || pluginOptions.title || location.hostname,
            confirmText: opts.confirmText || '确定',
            cancelText: opts.cancelText || '取消'
          }, mergedOptions);
    };
    
    // 自定义alert方法
    const customAlert = async (message: string, opts: AlertOptions = {}): Promise<void> => {
      // 在不支持的环境下或未初始化完成时回退到原生方法
      // isIOS || 
      console.log("CustomAlertPlugin install customAlert", modalContainerInstance)
      if (!modalContainerInstance?.exposed) {
        originalAlert(message);
      }
      // 合并插件配置和调用配置
      const mergedOptions = { ...pluginOptions, ...opts };
      // 异步显示对话框
      return await modalContainerInstance.exposed.showModal(CustomAlert, {
            message,
            title: opts.title || pluginOptions.title || location.hostname,
            confirmText: opts.confirmText || '确定'
          }, mergedOptions);
    };
    
    // 挂载Container
    mountContainer();
    
    // 挂载到window对象，使其全局可用
    // window.confirm = customConfirm as typeof window.confirm;
    // window.alert = customAlert as typeof window.alert;

    // 使用类型断言强制类型兼容
    (window as any).confirm = customConfirm;
    (window as any).alert = customAlert;
    
    // 保存原始方法以便需要时恢复
    // window.nativeConfirm = originalConfirm;
    // window.nativeAlert = originalAlert;
    
    // 挂载到Vue实例，方便组件内使用
    app.config.globalProperties.$confirm = customConfirm;
    app.config.globalProperties.$alert = customAlert;
    
    // 提供组合式API方式使用
    app.provide('confirm', customConfirm);
    app.provide('alert', customAlert);
  },
  
  // 恢复原生方法
  restoreNative(): void {
    // if (window.nativeConfirm) {
    //   window.confirm = window.nativeConfirm;
    // }
    // if (window.nativeAlert) {
    //   window.alert = window.nativeAlert;
    // }
  },
  
  // 销毁插件
  destroy(): void {
    // 这里应该有销毁逻辑，但需要访问私有变量
    // 在实际实现中可能需要重新设计结构
    this.restoreNative();
  }
};

export default CustomAlertPlugin;