(function(){
    console.log("script-runner.js");

    function getContext(){ 
        return {
            browser: chrome || browser  || window.browser || window.chrome
        }
    }


    function run(code){
        const scriptDom = document.createElement('script');
        scriptDom.type = 'text/javascript';
        const resultEventName = 'doma-script-runner-result';
        scriptDom.textContent = `(function(){
            try {
                var __domaScriptRunnerResult = (function(){
                    ${code}
                })();
                window.dispatchEvent(new CustomEvent('${resultEventName}', { detail: __domaScriptRunnerResult }));
            } catch (e) {
                window.dispatchEvent(new CustomEvent('${resultEventName}', { detail: undefined }));
            }
        })();`;
        scriptDom.setAttribute('doma-script-runner', 'true');
        document.head.appendChild(scriptDom);
    }

    async function initialize(){
        getContext().browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.origin === "background" && message.operate === "script-runner/execute"){
                const script = message.script;
                if (!script.allFrames || (script.allFrames && window.self !== window.top)){
                    const resultEventName = 'doma-script-runner-result';
                    function handleResult(event) {
                        window.removeEventListener(resultEventName, handleResult);
                        sendResponse(event.detail);
                    }
                    window.addEventListener(resultEventName, handleResult);
                    run(script.code);
                    return true;
                }
            }
        });
    }

    initialize();
})();