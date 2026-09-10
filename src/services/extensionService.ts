import { getContext } from "./Context";
export function isUserScriptsAvailable(){
  try {
    return getContext().browser.userScripts != undefined;
  } catch {
    return false;
  }
}

export function isAbove138(){
  let version = Number(navigator.userAgent.match(/(Chrome|Chromium)\/([0-9]+)/)?.[2]);
  return version >= 138;
}

export async function getUserscriptStorage(uuid: string){
  const result = await getContext().browser.runtime.sendMessage({ origin: 'content', operate: 'background/v3/storage.local.list', uuid: uuid });
  const prefix = `_${uuid}_`;
  const parsedResult: Record<string, any> = {};
  const allKeys = Object.keys(result);
  for (let i = 0; i < allKeys.length; i++){
      const key = allKeys[i];
      if (key.startsWith(prefix)) {
        const k = key.replace(prefix, '');
        parsedResult[k] = result[key];
      }
  }
  return parsedResult;
}

export async function setUserscriptStorage(uuid: string, key: string, value: any){
  return await getContext().browser.runtime.sendMessage({ origin: 'content', operate: 'background/v3/storage.local.set', keys: { [`_${uuid}_${key}`]: value } });
}

export async function deleteUserscriptStorage(uuid: string, keys: string[]){
  const realKeys = keys.map(key => `_${uuid}_${key}`);
  return await getContext().browser.runtime.sendMessage({ origin: 'content', operate: 'background/v3/storage.local.remove', keys: realKeys });
}



export function getImageUrl(name: string){
  return getContext().browser.runtime.getURL(`/extension-img/${name}`);
}

export function getLocalizedString(key: string, ...substitutions: string[]) {
  return getContext().browser.i18n.getMessage(key, substitutions);
}


export function switchToStayOfficial(path:string | undefined | null){
  // const stayOfficialBaseUrl = "https://staybrowser.com"
  // const stayOfficialBaseUrl = "http://192.168.50.79:7090"
  const stayOfficialBaseUrl = "http://192.168.3.152:7090"
  const officialUrl = `${stayOfficialBaseUrl}${path}`;
  return new Promise<number>((resolve, reject) => {
    if (getContext().browser.windows) {
      getContext().browser.windows.getAll({ populate: true }).then((windows: any) => {
        let found = false;
        for (const window of windows) {
          if (found) break;
          if (window.tabs && window.tabs.length > 0) {
            for (const tab of window.tabs) {
              if (tab.url && tab.url.startsWith(stayOfficialBaseUrl)) {
                // 立即更新窗口和标签页
                getContext().browser.windows.update(window.id, { focused: true });
                getContext().browser.tabs.update(tab.id, { active: true, url: officialUrl });
                resolve(tab.id);
                found = true;
                break;
              }
            }
          }
        }
        if (!found) {
          // 打开新标签页
          getContext().browser.tabs.create({ url: officialUrl }).then((tab: any) => {
            resolve(tab.id);
          });
        }
      });
    } else {
      console.log("chrome.windows API 不可用");
      getContext().browser.tabs.query({ currentWindow: true }).then(async (tabs:any) => {
        let found = false;
        for (const tab of tabs) {
          if (tab.url && tab.url.startsWith(stayOfficialBaseUrl)) {
            // 立即更新窗口和标签页
            getContext().browser.tabs.update(tab.id, { active: true, url: officialUrl });
            resolve(tab.id);
            found = true;
            break;
          }
        }
        if (!found) {
          // 打开新标签页
          getContext().browser.tabs.create({ url: officialUrl }).then((tab: any) => {
            resolve(tab.id);
          }); 
        }
      });
    }
    
  })
}


export function switchToStayExtension(path:string | undefined | null){
  // const extensionId = getContext().browser.runtime.id;
  // console.log("switchToStayExtension----extensionId--", extensionId);
  const stayExtensionBaseUrl = getContext().browser.runtime.getURL('');
  const optionsUrl = `${stayExtensionBaseUrl}options/index.html`;

  return new Promise<number>((resolve, reject) => {
    // 查询已存在的options页面标签
    getContext().browser.tabs.query({ url: optionsUrl }).then(async (tabs:any) => {
      let jumpPath = optionsUrl;
      // console.log("switchToStayExtension------tabs", tabs);
      if(path && path.length > 0 && path != " "){
        jumpPath = `${optionsUrl}#${path}`;
      }
      
      if (tabs && tabs.length > 0) {
        // 激活并聚焦现有标签
        // console.log("switchToStayExtension---update tab-1-", jumpPath)
        await getContext().browser.tabs.update(tabs[0].id, { active: true, url: jumpPath });
        // await getContext().browser.windows.update(tabs[0].windowId, { focused: true });
        resolve(tabs[0].id);
      } else {
        // 查所有标签页
        getContext().browser.tabs.query({ currentWindow: true }).then(async (tabs:any) => {
          if(tabs && tabs.length > 0){
            // console.log("switchToStayExtension---query tab-1-", tabs, stayExtensionBaseUrl)
            let optionTabList = tabs.filter((tab:any) => tab.url && tab.url.startsWith(stayExtensionBaseUrl));
            // console.log("switchToStayExtension---query tab-2-", optionTabList)
            if(optionTabList && optionTabList.length > 0){
              // console.log("switchToStayExtension---update tab-2-", jumpPath)
              await getContext().browser.tabs.update(optionTabList[0].id, { active: true, url: jumpPath });
              // await getContext().browser.windows.update(optionTabList[0].windowId, { focused: true });
              resolve(optionTabList[0].id);
            }else{
              // console.log("switchToStayExtension---create new tab-1-", jumpPath)
              // 创建新标签页
              const res = await getContext().browser.tabs.create({ url: jumpPath });
              resolve(res.openerTabId || 0);
            }
          }else{
            // console.log("switchToStayExtension---create new tab-2-", jumpPath)
            // 创建新标签页
            const res = await getContext().browser.tabs.create({ url: jumpPath });
            resolve(res.openerTabId || 0);
          }
        })
      }
    })
  })
  
}