import { IPAddressValidator } from "./IPAddressValidator";
import { RootZoneDatabase } from "./RootZoneDatabase";
export function completeUrl(url: string){
    if (!url.startsWith("http")){
        if (IPAddressValidator.isValidIP(url)){
          return "http://" + url;
        }
        else{
          return "https://" + url;
        }
      }
  
      return url;
}

export function getUrlObj(urlString: string){
    try{
        return new URL(urlString);
    }
    catch(e){
        return undefined;
    }
}

export function validUrl(text: string): boolean{
    const url = completeUrl(text);
    try{
        const urlObj = getUrlObj(url);
        if (urlObj){
            const host = urlObj.host;
            const dotIndex = host.lastIndexOf(".");
            if (dotIndex > 0){
            let root = ".";
            for (let i = dotIndex + 1; i < host.length; i++){
                if (host.charAt(i) === '/' || host.charAt(i) === '?' || host.charAt(i) === '#'){
                break;
                }

                root += host.charAt(i);
            }

            return RootZoneDatabase.getInstance().isRoot(root);
            }
        }
    } catch (e) {

    }

    return false;
  }


export function getFiletypeByUrl(url:string){
  if(!url){
    return '';
  }
  if(isBlobUrl(url)){
    url = url.replace("blob:", "");
  }
  let pathname = new URL(url).pathname;
  return pathname.split('.').pop();
}
export function isURL(s:string) {
  return /^http[s]?:\/\/.*/.test(s);
}

export function getHostname(url:string) {
  if(!url){
    return url
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (error) {
    return url.split('/')[2].toLowerCase();
  }
}


export function isBase64Data(str:string){
  if(!str){
    return false;
  }
  if(/^data:.*\w+;base64,/.test(str)){
    return true;
  }
  if(str === '' || str.trim() === ''){
    return false;
  }
  try{
    return window.btoa(window.atob(str)) == str;
  }catch(err){
    return false;
  }
}


export function base64ToBlob(code:string) {
  if(!isBase64Data(code)){
    return ""
  }
  var parts = code.split(";base64,");
  var contentType = parts[0].split(":")[1];
  var raw = window.atob(parts[1]);
  var rawLength = raw.length;
  var uint8Array = new Uint8Array(rawLength);
  for (var i = 0; i < rawLength; i++) {
    uint8Array[i] = raw.charCodeAt(i);
  }
  return new Blob([uint8Array], {type: contentType});
}

export function base64ToObjectURL(baseCode:string){
  if(!isBase64Data(baseCode)){
    return ""
  }
  const blob = base64ToBlob(baseCode);
  return blob ? URL.createObjectURL(blob) : "";
}


export function getFilenameByUrl(url:string){
  if(!url){
    return '';
  }
  if(isBlobUrl(url)){
    url = url.replace("blob:", "");
  }
  let pathname = new URL(url).pathname
  return pathname.split('/').pop();
}


export function isBlobUrl(str:string) {
  // 正则表达式，匹配 blob URL 格式
  const regex = /^blob:/;
  return regex.test(str);
}

export function getDomain(url:string){
  let l2domain = getLevel1Domain(url);
  if(!l2domain){
    return '';
  }
  let reg = new RegExp('.(com.cn|com|net.cn|net|org.cn|org|gov.cn|gov|cn|mobi|me|info|name|biz|cc|tv|asia|hk|网络|公司|中国)','g');
  return l2domain.replace(reg, '');
}

export function getLevel1Domain(url:string) {
  try {
    if(!isURL(url)){
      return url;
    }
    let subdomain = ''
    const hostname = new URL(url).hostname
    const domainList = hostname.split('.')
    const urlItems = []
    urlItems.unshift(domainList.pop())
    while (urlItems.length < 2) {
      urlItems.unshift(domainList.pop())
      subdomain = urlItems.join('.')
    }
    return subdomain
  } catch (e) {
    return ''
  }
}

export const hashName = () => {
    const hashString = location.hash;
    if(hashString == '' || !hashString){
        return '#';
    }else{
        return hashString.split("?")[0];
    }
}

export const replaceHashName = (hash: string, toHash: string) => {
    const hashPath = hashName();
    toHash = toHash || ''
    if(hash && hashPath && hashPath == hash){
        window.location.hash = toHash;
    }
}
