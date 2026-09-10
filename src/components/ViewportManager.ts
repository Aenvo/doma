import { onUnmounted } from 'vue';
import { isIOS } from '@/utils/device';

/**
 * 视口管理器 - 统一处理iOS设备上的虚拟键盘和视口高度问题
 */
class ViewportManager {
  private static instance: ViewportManager;
  
  // 存储注册的组件信息
  private components: Map<string, {
    hasInput?: boolean;
    onKeyboardStateChange?: (visible: boolean) => void;
  }> = new Map();
  
  // 视口和键盘状态
  private originalViewportHeight: number = 0;
  private keyboardVisible: boolean = false;
  private isIOS: boolean = false;
  private isRegistered: boolean = false;
  private resizeTimeout: number | null = null;
  // 记录上一次出现虚拟键盘后或者未出现虚拟键盘时的ViewportHeight，主要是为了判断显示虚拟键盘后dialog是否显示出来
  private lastViewportHeight: number = 0;
  
  // 单例模式
  public static getInstance(): ViewportManager {
    if (!ViewportManager.instance) {
      ViewportManager.instance = new ViewportManager();
    }
    return ViewportManager.instance;
  }
  
  private constructor() {
    // 检测是否为iOS设备
    this.isIOS = isIOS();
    // 初始化原始视口高度
    if (this.isIOS && window.innerHeight) {
      this.originalViewportHeight = window.innerHeight;
      this.lastViewportHeight = this.originalViewportHeight;
    }
  }
  
  /**
   * 注册组件到视口管理器
   * @param componentId 组件唯一标识
   * @param options 组件配置
   */
  public register(componentId: string, options?: {
    hasInput?: boolean;
    onKeyboardStateChange?: (visible: boolean) => void;
  }): void {
    // 存储组件信息
    this.components.set(componentId, {
      hasInput: options?.hasInput ?? true,
      onKeyboardStateChange: options?.onKeyboardStateChange
    });
    
    // 如果是第一个注册的组件，并且是iOS设备，初始化事件监听
    if (!this.isRegistered && this.isIOS) {
      this.initEventListeners();
      this.isRegistered = true;
      this.initializeViewportHeight()
    }
  }

  /**
   * 初始化视口高度（确保在DOM加载完成后）
   */
  private initializeViewportHeight(): void {
    // 使用requestAnimationFrame确保在DOM渲染完成后获取正确的视口高度
    requestAnimationFrame(() => {
      if (window.visualViewport) {
        this.originalViewportHeight = window.visualViewport.height;
        var vh = this.getCSSVariable("--vh");
        console.log('初始化视口高度:', this.originalViewportHeight, vh);
        // 立即设置初始的--vh值
        // document.documentElement.style.setProperty('--vh', `${this.originalViewportHeight * 0.01}px`);
      }
    });
  }
  
  /**
   * 注销组件
   * @param componentId 组件唯一标识
   */
  public unregister(componentId: string): void {
    this.components.delete(componentId);
    
    // 如果没有组件注册了，清理事件监听
    if (this.components.size === 0 && this.isRegistered) {
      this.cleanupEventListeners();
      this.resetViewport();
      this.isRegistered = false;
    }
  }
  
  /**
   * 初始化事件监听
   */
  private initEventListeners(): void {
    if (!this.isIOS) return;
    
    // 添加键盘相关事件监听
    document.addEventListener('focusin', this.handleFocusIn, true);
    document.addEventListener('focusout', this.handleFocusOut, true);
    
    // 添加视口大小变化事件监听
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', this.handleViewportResize);
      // 初始化视口高度
      // this.handleViewportResize();
    }
  }

  /**
   * 获取CSS变量的值
   * @param {string} variableName - CSS变量名称（带--前缀）
   * @param {HTMLElement} element - 元素，默认为document.documentElement
   * @returns {string|null} CSS变量的值
   */
  private getCSSVariable = (variableName: string, element = document.documentElement) => {
    try {
      const styles = window.getComputedStyle(element);
      return styles.getPropertyValue(variableName).trim() || null;
    } catch (error) {
      console.error(`获取CSS变量${variableName}失败:`, error);
      return null;
    }
  };

  /**
   * 设置CSS变量的值
   * @param {string} variableName - CSS变量名称（带--前缀）
   * @param {string|null} value - 要设置的值，为null时移除该变量
   * @param {HTMLElement} element - 元素，默认为document.documentElement
   */
  private setCSSVariable = (variableName: string, value: string | null, element = document.documentElement) => {
    try {
      if (value === null) {
        element.style.removeProperty(variableName);
      } else {
        element.style.setProperty(variableName, value);
      }
    } catch (error) {
      console.error(`设置CSS变量${variableName}失败:`, error);
    }
  };
  
  /**
   * 清理事件监听
   */
  private cleanupEventListeners(): void {
    if (!this.isIOS) return;
    
    document.removeEventListener('focusin', this.handleFocusIn, true);
    document.removeEventListener('focusout', this.handleFocusOut, true);
    
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', this.handleViewportResize);
    }
    // window.removeEventListener('resize', this.handleWindowResize);
    
    // 清理定时器
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
      this.resizeTimeout = null;
    }
  }
  
  /**
   * 处理焦点进入事件
   */
  private handleFocusIn = (e: FocusEvent): void => {
    const target = e.target as HTMLElement;
    // 仅处理输入元素的焦点事件
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      // 取消之前的滚动尝试，避免与键盘弹出冲突
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      // 延迟执行滚动，但时间调整为更短，避免与键盘动画冲突
      this.resizeTimeout = window.setTimeout(() => {
        // 检查元素是否仍然可见且有焦点
        const isElementVisible = target.offsetParent !== null;
        const hasFocus = document.activeElement === target;
        
        if (isElementVisible && hasFocus) {
          try {
            // 轻微调整滚动行为，不使用center避免过度滚动
            target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } catch {
            target.scrollIntoView(false);
          }
        }
      }, 100);
    }
  };
  
  /**
   * 处理焦点离开事件
   */
  private handleFocusOut = (e: FocusEvent): void => {
    const target = e.target as HTMLElement;
    // 仅处理输入元素的焦点事件
    if ((target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && this.keyboardVisible) {
      // 延迟执行，确保键盘完全收起
      setTimeout(() => {
        if (!this.keyboardVisible) {
          this.resetViewportHeight();
        }
      }, 400);
    }
  };
  
  /**
   * 处理视口大小变化事件
   */
  private handleViewportResize = (): void => {
    
    // 使用防抖处理，避免频繁更新
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }

    this.resizeTimeout = window.setTimeout(() => {

      // const viewportHeight = window.visualViewport?.height || window.innerHeight;
      // // 关键：加上 offsetTop
      const viewportHeight = window.visualViewport ? window.visualViewport.height + window.visualViewport.offsetTop : window.innerHeight;
      
      // 检测是否是键盘弹出
      const isKeyboardOpening = viewportHeight < this.lastViewportHeight;

      const currentVH = this.getCSSVariable("--vh");
      console.log('viewportHeight:', viewportHeight, currentVH);

      requestAnimationFrame(() => {
        if(isKeyboardOpening){
          // 优化键盘检测逻辑：使用更小的阈值和更严格的条件
          const heightDiff = this.originalViewportHeight - viewportHeight;
          const keyboardHeight = Math.max(0, heightDiff);
          const isKeyboardCurrentlyVisible = keyboardHeight > 50 && keyboardHeight < 1000; // 设置合理的范围
          
          const newVHValue = `${viewportHeight * 0.01}px`;
          // 只有在以下情况才更新--vh：
          // 1. 当前没有设置--vh
          // 2. 计算的键盘高度在合理范围内（50-1000px）
          // 3. 新的--vh值与当前值有显著差异
          if(!currentVH || (isKeyboardCurrentlyVisible && currentVH !== newVHValue)){
            this.setCSSVariable('--vh', newVHValue);
            this.keyboardVisible = true;
            this.setCSSVariable('--keyboard-visible', 'true');
            this.setCSSVariable('--keyboard-height', `${keyboardHeight}px`);
          }

        }else{
          // 隐藏键盘了
          this.originalViewportHeight = viewportHeight;
          const originalVHValue = `${this.originalViewportHeight * 0.01}px`;
          if (currentVH !== originalVHValue) {
            this.keyboardVisible = false;
            this.resetViewportHeight();
          }
          // this.keyboardVisible = false;
          // this.resetViewportHeight();
        }
        this.lastViewportHeight = viewportHeight;
      })
    }, 50); // 50ms的防抖延迟
  };

  
  /**
   * 重置视口高度
   */
  private resetViewportHeight(): void {
    document.documentElement.style.setProperty('--vh', `${this.originalViewportHeight * 0.01}px`);
    
    document.documentElement.style.removeProperty('--keyboard-height');
    // 🔥 延迟移除，避免 iOS 键盘收起动画期间的闪烁
    setTimeout(() => {
      this.setCSSVariable('--keyboard-height', null);
      this.setCSSVariable('--keyboard-visible', null);
    }, 500);
  }
  
  /**
   * 完全重置视口状态
   */
  private resetViewport(): void {
    // 延迟执行，确保所有组件都已卸载
    setTimeout(() => {
      const safeViewportHeight = this.originalViewportHeight || window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${safeViewportHeight * 0.01}px`);
      document.documentElement.style.removeProperty('--keyboard-height');
      document.documentElement.style.removeProperty('--keyboard-visible');
      this.originalViewportHeight = 0;
      this.keyboardVisible = false;
    }, 300);
  }
  
  /**
   * 手动重置视口高度（供外部调用）
   */
  public manualReset(): void {
    if(!this.isIOS) return;
    this.resetViewportHeight();
  }

  public autoBlurInput(): void {
    if(!this.isIOS) return;
    // 主动移除焦点，帮助收起键盘
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      activeElement.blur();
    }
  }
  
}

// 导出单例实例
export const viewportManager = ViewportManager.getInstance();

// 提供Vue组合式函数，方便在组件中使用
export function useViewportManager(componentId: string, options?: {
  hasInput?: boolean;
  onKeyboardStateChange?: (visible: boolean) => void;
}) {
  // onMounted(() => {
  //   viewportManager.register(componentId, options);
  // });
  viewportManager.register(componentId, options);
  onUnmounted(() => {
    viewportManager.unregister(componentId);
  });
  
  return {
    manualReset: () => viewportManager.manualReset(),
    autoBlurInput: () => viewportManager.autoBlurInput(),
  };
}