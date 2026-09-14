export function getContext(){
  return {
    // @ts-ignore
    browser: chrome || browser  || window.browser || window.chrome
  }
}

export const openNewBlankTab = async () => {
// Firefox 支持 about:blank 和 about:newtab。
  // Chrome 需用 chrome://newtab（直接 about:blank 可能被拦截）。
  // @ts-ignore
  const newTabUrl = typeof browser == "undefined" ?  "chrome://newtab" : "about:newtab";
  await getContext().browser.tabs.create({ url: newTabUrl, active: true });
}

export const getWindow = () => {
  return new Promise<any>((resolve, reject) => {
    getContext().browser.windows.getCurrent().then((win:any)=>{
      console.log("win--------", win);
      resolve(win);
    }).catch((err:any)=>{
      reject(err)
      console.error("getWindow error:", err);
    });
  });
}

export const getCurrentWindowId = () => {
  return new Promise<number>((resolve, reject) => {
    getWindow().then((win:any)=>{
      resolve(win.id);
    }).catch((err:any)=>{
      reject(err)
      console.error("getCurrentWindowId error:", err);
    });
  });
}

export const windowIncognito = () => {
  return new Promise<boolean>((resolve, reject) => {
    getContext().browser.windows.getCurrent().then((win:any)=>{
      // console.log("win---windowIncognito-----", win);
      resolve(win.incognito || false);
    }).catch((error:any) => {  // 新增错误处理
      console.error('隐私模式检测失败:', error);
      resolve(false);
    });
  });
}

export const openOptionsPage = async () => {
  await getContext().browser.runtime.openOptionsPage();
  window.close();
}

export const openUrlInSafariPopup = (openUrl:string, target='') => {
  // console.log("openUrlInSafariPopup--------", openUrl);
  getContext().browser.tabs.query({
    active: true,
    currentWindow: true
  }, (tabs:any) => {
    // console.log("openUrlInSafariPopup------tabs--", tabs);
    let message = { group: 'popup', operate: 'windowOpen', openUrl, target: target};
    getContext().browser.tabs.sendMessage(tabs[0].id, message, (_response:any) => {
      // console.log("openUrlInSafariPopup----response------", response);
      window.close();
    })
    // 下载那边,StayBrowser_Android平台下,不用关闭窗口
    if((openUrl.includes("x-callback-url/downloadFile") || openUrl.includes("x-callback-url/snifferVideo")) 
      && import.meta.env.VITE_STAY_EXTENSION_PLATFORM_NAME == "StayBrowser_Android" ){
      return;
    }else{
      window.close();
    }
    
  })
}


export const openAppInPopup = (openUrl:string, storeUrl:string, openText: string, callback:Function) => {
  // console.log("openUrlInSafariPopup--------", openUrl);
  getContext().browser.tabs.query({
    active: true,
    currentWindow: true
  }, (tabs:any) => {
    // console.log("openUrlInSafariPopup------tabs--", tabs);
    let message = { group: 'popup', operate: 'openApp', openUrl, storeUrl: storeUrl, openText: openText};
    getContext().browser.tabs.sendMessage(tabs[0].id, message, (_response:any) => {
      // console.log("openUrlInSafariPopup----response------", response);
      callback && callback();
    })
  })
}

export const reloadCurrentPage = () => {
  return new Promise((resolve, reject) => {
    getContext().browser.tabs.query({active: true, currentWindow: true}, function(tabs:any){
      const tabId = tabs.length ? tabs[0].id: null;
      if(tabId){
        getContext().browser.tabs.reload(tabs[0].id, { bypassCache: true });
        resolve(true);
      }
    });
  })
}


export const getCurrentTab = (callback:Function, currentWindow: boolean = true) => {
  // Safari 页内壳走 edition/pro（hostTab）；Open 仍为 tabs.query
  void import("@/edition/activeBrowserTab").then(({ getCurrentTab: getTab }) => {
    getTab(callback, currentWindow);
  }).catch(() => {
    callback(null, null);
  });
}

export const blankWebList = ["about://newtab/","chrome://new-tab-page/", "favorites://", "chrome://newtab/", "edge://newtab/", "about:newtab"];

export function isBrowserProtected(){
  const extensionUrlReg = new RegExp('^(chrome-?|moz-?|edge-?)?(extension)?(:)?//[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]', 'g');
  return new Promise<boolean>((resolve, reject) => {
    try {
      getCurrentTab((tabUrl:string, _tabId:number)=>{
        console.log('--------tabUrl------',tabUrl)
        if(!tabUrl || blankWebList.includes(tabUrl) || tabUrl.match(extensionUrlReg) || !tabUrl.match(/^https?:\/\//)){
          console.log('--------tabUrl----Protected--',tabUrl)
          resolve(true);
        }
        resolve(false);
      })
    } catch (error) {
      console.log('--------tabUrl----Protected--error',error)
      resolve(false);
    }
  })
  
}


