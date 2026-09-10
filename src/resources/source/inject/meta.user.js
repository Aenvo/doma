(function(){
    console.log("meta.user.js");

    

    const context = {
        browser: chrome || browser || window.browser || window.chrome
    }

    let executed = false;
    if (document.readyState === 'interactive' || document.readyState == 'complete'){
        fetchMeta(false);
    }
    else{
        document.addEventListener('readystatechange', function(e) {
            if (document.readyState === 'interactive' || document.readyState === 'complete') {
                fetchMeta(false);
            }
        });
    }

    window.addEventListener('stay.sendFetchMeta', event => {
        fetchMeta(true);
    });

    async function fetchMeta(force){
        if (!force && executed) return;
        executed = true;

        const metaInfo = {};
        metaInfo.title = document.title;
        const metaElements = document.querySelectorAll('meta');
        for (var i = 0; i < metaElements.length; i++){
            const metaElement = metaElements[i];
            if (metaElement.getAttribute('name') === 'description'){
                metaInfo.description = metaElement.getAttribute('content');
            }
            else{
                const property = metaElement.getAttribute('property');
                const content =  metaElement.getAttribute('content');
                if (property === 'og:image'){
                    metaInfo.imageUrl = content;
                }
                else if (property === 'og:image:width'){
                    metaInfo.imageWidth = parseInt(content);
                }
                else if (property === 'og:image:height'){
                    metaInfo.imageHeight = parseInt(content);
                }
                else if (property === 'og:description'){
                    metaInfo.description = content;
                }
            }
        }

        let maxSize = 0;
        const linkElements = document.querySelectorAll('link')        
        for (var i = 0; i < linkElements.length; i++){
            const linkElement = linkElements[i];
            const rel = linkElement.getAttribute('rel');
            const href =  linkElement.getAttribute('href');
            const sizes = linkElement.getAttribute('sizes');
            if (rel === "apple-touch-icon-precomposed"){
                metaInfo.faviconUrl = getHref(href);
                break;
            }
            else if (rel && rel.startsWith('apple-touch-icon') || rel === 'icon' || rel === 'shortcut icon'){
                if (sizes){
                    let sizeMatched = sizes.match(/\d+/);
                    if (sizeMatched){
                        let size = parseInt(sizeMatched[0], 10);
                        if (size > maxSize){
                            maxSize = size;
                            metaInfo.faviconUrl = getHref(href);
                        }
                    }
                }
                else{
                    if (!metaInfo.faviconUrl){
                        metaInfo.faviconUrl = getHref(href);
                    }
                    
                }
            }   
        }

        metaInfo.faviconUrl = metaInfo.faviconUrl || window.location.origin + "/favicon.ico";
        console.log("faviconUrl",metaInfo.faviconUrl);
        window.stay_faviconUrl = metaInfo.faviconUrl;
        context.browser.runtime.sendMessage({ origin: 'userscript', operate: 'sendMetaInfo', metaInfo}, (response) => {});    
        // context.browser.tabs.getCurrent().then(tab => {
        //     if (window == window.top){
        //         metaInfo.tabId = tab.id;
        //         context.browser.runtime.sendMessage({ origin: 'userscript', operate: 'sendMetaInfo', metaInfo}, (response) => {});    
        //     }
        // });
    }

    function getHref(href){
        if (href.startsWith("http://") || href.startsWith("https://")){
            return href;
        }
        else{
            if (href.startsWith("//")){
                return "https:" + href;
            }
            else if (href.startsWith("/")){
                return window.location.origin + href;
            }
            else if (href.startsWith("..")){
                return window.location.href + href;
            }
            else{
                return window.location.href + href;
            }
        }
    }
})();