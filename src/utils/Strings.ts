export class Strings {
    public static async stringWithContentsOfURL(url: string){
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
        
        try {
            const response = await fetch(url, {
                signal: controller.signal,
                // 设置连接超时
                keepalive: true,
                // 设置读取超时
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);
            return response.text();
        } catch (error: any) {
            clearTimeout(timeoutId);
            return null;
        }
    }

    public static getRandomUUID(){
        var d = new Date().getTime();
        if (typeof performance !== 'undefined' && typeof performance.now === 'function'){
          d += performance.now(); // 使用性能API获取更高精度的时间戳
        }
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = (d + Math.random() * 16) % 16 | 0;
          d = Math.floor(d / 16);
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        return uuid.toUpperCase();
    }

    public static uuid(size:number){
      size = size || 20;
      if(size > 36){
        size = 35;
      }
      return Math.random().toString(36).substring(2, size);
    }

    public static versionCompare(version1: string, version2: string) {
      if (!version1.includes(".") || !version2.includes(".")) {
        return version1.localeCompare(version2);
      }
  
      const v1 = version1.replace(/[^0-9.]/g, "").replace(/\.$/, "").split(".");
      const v2 = version2.replace(/[^0-9.]/g, "").replace(/\.$/, "").split(".");
  
      for (let i = 0; i < Math.min(v1.length, v2.length); i++) {
        const num1 = parseInt(v1[i], 10);
        const num2 = parseInt(v2[i], 10);
  
        if (num1 > num2) {
          return 1;
        } else if (num1 < num2) {
          return -1;
        }
      }
  
      return Math.sign(v1.length - v2.length);
    }
}


export function unhtml(str: string) {
  return str ? str.replace(/[<">']/g, (a) => ({
      '<': '&lt;',
      '"': '&quot;',
      '>': '&gt;',
      '\'': '&#39;'
    }[a] || a)) : '';
}

export function getFormatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return fileSize + "B";
  } else if (fileSize < 1024 * 1024) {
    return (fileSize / 1024).toFixed(1) + "KB";
  } else if (fileSize < 1024 * 1024 * 1024) {
    return (fileSize / (1024 * 1024)).toFixed(1) + "MB";
  } else if (fileSize < 1024 * 1024 * 1024 * 1024) {
    return (fileSize / (1024 * 1024 * 1024)).toFixed(1) + "GB";
  } else {
    return (fileSize / (1024 * 1024 * 1024 * 1024)).toFixed(1) + "TB";
  }
}

export function removeLastPath(u: string): string {
  const lastIndex = u.lastIndexOf('/')
  return lastIndex >= 0 ? u.substring(0, lastIndex + 1) : u
}