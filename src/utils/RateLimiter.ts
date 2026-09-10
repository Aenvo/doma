
/**
 * 防抖函数（Debounce）
 * @param func 要执行的函数
 * @param wait 等待时间（毫秒）
 * @param immediate 是否立即执行
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func.apply(this, args);
    };
    
    const callNow = immediate && !timeout;
    if (timeout) clearTimeout(timeout);
    
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(this, args);
  };
}


/**
 * 增强型节流函数（支持 leading 和 trailing 模式）
 * @param func 需要节流的函数
 * @param limit 节流时间（毫秒）
 * @param options 配置项 {leading: 是否立即执行, trailing: 是否在结束后执行}
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number,
  options: { leading?: boolean; trailing?: boolean } = { leading: true, trailing: true }
): ((...args: Parameters<T>) => void) => {
  let lastExecTime = 0;
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
  const { leading = true, trailing = true } = options;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = limit - (now - lastExecTime);

    const execute = () => {
      func.apply(this, args);
      lastExecTime = now;
    };

    if (remaining <= 0) {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      if (leading) {
        execute();
      }
    } else if (!pendingTimeout && trailing) {
      pendingTimeout = setTimeout(() => {
        execute();
        pendingTimeout = null;
      }, remaining);
    }
  };
}