
export function language(){
  let lang =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages[0]
      : navigator.language || 'en';
  return lang;
}

export function languageCode() {
  let lang = language();
  lang = lang.toLowerCase();
  lang = lang.replace(/-/, '_'); // some browsers report language as en-US instead of en_US
  if (lang.length > 3) {
    lang = lang.substring(0, 3) + lang.substring(3).toUpperCase();
  }
  return lang;
}

export const isMobile = (): boolean => {
  if (typeof window === 'undefined') return false // SSR安全处理

  // 方法1：用户代理检测
  const ua = window.navigator.userAgent.toLowerCase();
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|windows phone/i
  
  return mobileRegex.test(ua);
}

export const STAY_STORE_URL= "https://apps.apple.com/cn/app/stay-for-safari-%E6%B5%8F%E8%A7%88%E5%99%A8%E4%BC%B4%E4%BE%A3/id1591620171";
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function getOSType() {
  const ua = navigator.userAgent.toLowerCase();
  let osType: 'ios' | 'macos' | 'windows' | 'android' | 'harmony' | 'unknown' = 'unknown';
  if (/iphone|ipad|ipod/.test(ua)) {
    osType = 'ios';
  } else if (/macintosh/.test(ua)) {
    osType = 'macos';
  } else if (/windows/.test(ua)) {
    osType = 'windows';
  } else if (/android/.test(ua)) {
    osType = 'android';
  } else if (/harmonyos/.test(ua)) {
    osType = 'harmony';
  }
  return osType;
}

export const getBrowserInfo = (): {
  name: string;
  version: string | null;
  isMobile: boolean;
  osType: string;
} => {
  // if (typeof window === 'undefined') {
  //   return { name: 'unknown', version: null, isMobile: false, osType: "unknown" };
  // }
  let ua = navigator.userAgent.toLowerCase();
  const mobile = isMobile();
  const osType = getOSType();
  // Edge浏览器检测
  if (/edg\//i.test(ua)) {
    const match = ua.match(/edg\/(\d+)/i);
    return { name: 'edge', version: match ? match[1] : null, isMobile: mobile, osType };
  }
  
  // Chrome浏览器检测
  if (/(chrome|chromium)\//i.test(ua) && !/edg\//i.test(ua)) {
    const match = ua.match(/(chrome|chromium)\/(\d+)/i);
    return { name: 'chrome', version: match ? match[2] : null, isMobile: mobile, osType };
  }
  
  // Firefox浏览器检测
  if (/firefox\//i.test(ua)) {
    const match = ua.match(/firefox\/(\d+)/i);
    return { name: 'firefox', version: match ? match[1] : null, isMobile: mobile, osType };
  }
  
  // Safari浏览器检测
  if (/safari\//i.test(ua) && !/(chrome|chromium|edg)\//i.test(ua)) {
    const match = ua.match(/version\/(\d+)/i);
    return { name: 'safari', version: match ? match[1] : null, isMobile: mobile, osType };
  }
  
  // IE浏览器检测
  if (/trident\//i.test(ua)) {
    const match = ua.match(/trident\/(\d+)/i);
    let version = null;
    if (match) {
      // Trident版本映射到IE版本
      const tridentVersion = parseInt(match[1]);
      version = (tridentVersion + 4).toString();
    }
    return { name: 'ie', version, isMobile: mobile, osType };
  }
  
  // Opera浏览器检测
  if (/opr\//i.test(ua) || /opera\//i.test(ua)) {
    const match = ua.match(/(opr|opera)\/(\d+)/i);
    return { name: 'opera', version: match ? match[2] : null, isMobile: mobile, osType };
  }
  
  // 无法识别的浏览器
  return { name: 'unknown', version: null, isMobile: mobile, osType};
};

export const isIpad = (): boolean => {
  const userAgentInfo = navigator.userAgent;
  let Agents = ['iPad'];
  let getArr = Agents.filter(i => userAgentInfo.includes(i));
  let isIphoneOrIpad = getArr.length ? true : false;
  if(isIphoneOrIpad){
    return isIphoneOrIpad
  }else{
    if (userAgentInfo.match(/Macintosh/) && navigator.maxTouchPoints > 1) {
      return true;
    }
  }
  return isIphoneOrIpad;
}

export const isEdge = (): boolean => {
  if (typeof window === 'undefined') return false; // SSR安全处理
  const ua = window.navigator.userAgent;
  // 匹配新版Edge (Edg) 和旧版Edge (Edge)
  const edgeMatch = ua.match(/(Edg|Edge|EdgA)\/(\d+)/);
  return !!edgeMatch;
};

export const isChrome = (): boolean => {
  if (typeof window === 'undefined') return false // SSR安全处理
  const ua = window.navigator.userAgent
  
  // 检查是否是Edge浏览器（Edge也包含Chrome标识）
  const isEdge = /Edg\/(\d+)/.test(ua);
  if (isEdge) {
    return false;
  }
  
  // 检查是否包含Chrome或Chromium标识
  const hasChrome = /(Chrome|Chromium)\/(\d+)/.test(ua);
  if (hasChrome) {
    return true;
  }
  
  // 其他浏览器
  return false;
}


export const isSupportChromeUserScript = () => {
  let version = Number(navigator.userAgent.match(/(Chrome|Chromium)\/([0-9]+)/)?.[2]);
  if (version >= 138) {
    // Allow User Scripts toggle will be used.
    return true;
  } else {
    // Developer mode toggle will be used.
    return false;
  }
}


export function isDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function autoAndCheckDark(callback: Function) {
  // 创建一个媒体查询
  const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // 定义回调函数处理变化
  const handleDarkModeChange = (e:MediaQueryListEvent) => {
    if (e.matches) {
      // 系统启用了暗黑模式
      console.log('Dark mode enabled');
      callback(true)
    } else {
      // 系统启用了亮色模式
      console.log('Dark mode disabled');
      callback(false)
    }
  };

  // 初始状态
  // 立即执行一次初始回调
  callback(darkModeMediaQuery.matches);

  // 监听变化
  darkModeMediaQuery.addEventListener('change', handleDarkModeChange); 

}