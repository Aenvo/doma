
import { getOSType, isEdge, isSupportChromeUserScript } from "./device";
import { isUserScriptsAvailable } from "@/services/extensionService";

export const isSupportSidePannel = (): boolean => {
  return import.meta.env.VITE_STAY_EXTENSION_BROWSER_NAME != "mobile_lite";
}

export const isSupportBookmark = (): boolean => {
  return import.meta.env.VITE_STAY_EXTENSION_BROWSER_NAME != "mobile_lite";
}

export const isMobileLite = (): boolean => {
  return import.meta.env.VITE_STAY_EXTENSION_BROWSER_NAME == "mobile_lite";
}

/**
 * 检查是否需要提示用户脚本开关
 * @returns 
 *  0: 不需要提示;  
 *  2: 提示chrome浏览器开启允许用户脚本; 
 *  3: 提示edge浏览器开启允许用户脚本（安卓版开发者模式）; 
 *  4: 提示chrome浏览器开启开发者模式
 */
export const checkAllowUserScriptTips = () => {
  if(isUserScriptsAvailable() ||  "ios" == getOSType()){
    return 0;
  }else{
    if (isMobileLite() || isEdge()){
      // edge 浏览器显示开发者模式
      console.log("startFetchUserscript-----edge")
      return 3;
    }
    else{
      // chrome 浏览器显示用户脚本开关
      // todo 判断移动端和pc端的chrome浏览器的开关样式
      console.log("startFetchUserscript-----chrome")
      if(isSupportChromeUserScript()){
        // 大于138版本chrome浏览器支持用户脚本
        return 2;
      }else{
        return 4;
      }
    }
  }
}