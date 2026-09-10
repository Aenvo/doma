export class SearchManager {
    private static instance: SearchManager
    sessionMap: Map<string, ((result: string[]) => void) | null> = new Map();

    private constructor() {
    }

    public static get(): SearchManager {
        if (!SearchManager.instance) {
            SearchManager.instance = new SearchManager()
        }
        return SearchManager.instance
    }

    public getSuggestions(sessionId: string, searchUrl: string, responseHandler: ((result: string[] | null) => void) | null) {
        this.sessionMap.set(sessionId, responseHandler);

        try{
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 5秒超时
            
            fetch(searchUrl, {
                signal: controller.signal
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                
                console.log('Response headers:', response.headers);
                // 获取原始二进制数据，手动处理编码
                return response.arrayBuffer();
            })
            .then(buffer => {
                try {
                    // 尝试使用UTF-8解码
                    let text = new TextDecoder('utf-8').decode(buffer);
                    // 检测UTF-8编码是否正确（是否包含无效字符）
                    if (/\ufffd/.test(text)) {
                        // 包含无效字符，尝试使用GBK编码
                        text = new TextDecoder('gbk').decode(buffer);
                        console.log('使用GBK编码解码');
                    }
                    return text;
                } catch (error) {
                    console.error('解码失败，尝试默认解码:', error);
                    // 回退到使用response.text()
                    return new TextDecoder().decode(buffer);
                }
            })
            .then(text => {
                const result = this.parseSuggestions(text);
                if (this.sessionMap.get(sessionId) === responseHandler) {
                    responseHandler?.(result);
                    this.sessionMap.delete(sessionId);
                }
            })
            .catch(error => {
                console.error('Error fetching search suggestions:', error);
                if (this.sessionMap.get(sessionId) === responseHandler) {
                    responseHandler?.(null);
                    this.sessionMap.delete(sessionId);
                }
            })
            .finally(() => {
                clearTimeout(timeoutId);
            });
        }catch(error){
            if (this.sessionMap.get(sessionId) === responseHandler) {
                responseHandler?.(null);
                this.sessionMap.delete(sessionId);
            }
        }
    }

    private parseSuggestions(responseText: string) {
      console.log('Response text:', responseText);
        let result = responseText.replace(/\"/g, "");
        const leftIndex = result.indexOf("[", 1) + 1;
        const rightIndex = result.indexOf("]");
        if (leftIndex > 0 && rightIndex > 0) {
          let subStr = result.substring(leftIndex, rightIndex);
          if (subStr.length > 0) {
            if (subStr.includes("\\u")) {
              subStr = this.unescapeUnicode(subStr);
            }
            return subStr.split(",");
          }
        }
        return [];
    }

    private unescapeUnicode(str: string): string {
      return str.replace(/\\u[\dA-Fa-f]{4}/g, (match) =>
        String.fromCharCode(parseInt(match.replace('\\u', ''), 16))
      );
    }
}