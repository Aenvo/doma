import { getContext } from "./Context";
export enum STEventType {
    SyncPullTask = 'stay.syncPullTask',
    UserDidLogin = 'stay.userDidLogin',
    ReloadUserHead = 'stay.reloadUserHead',
    OptionsPageActivated = 'stay.optionsPageActivated',
    HasNewUserscriptVersion = 'stay.hasNewUserscriptVersion',
    ReloadRemoteSync = 'stay.reloadRemoteSync'
}

/** Open：事件总线（无账号栈；登录 reload 仅存在于 Pro overlay 的 STEvent）。 */
export class STEvent {
    private static instance: STEvent;
    public static get(): STEvent {
        if (!STEvent.instance) {
            STEvent.instance = new STEvent();
        }
        return STEvent.instance;
    }

    constructor(){
        getContext().browser.runtime.onMessage.addListener((message: any, _sender: any, _sendResponse: any) => {
            const {operate, origin} = message;
            if (origin === "background"){
                if (operate === "event/post"){
                    const {type, data, targetUrl} = message;
                    if (targetUrl === window.location.href){
                        window.dispatchEvent(new CustomEvent(type, {
                            detail: data
                        }));
                    }
                }
            }
            return true;
        })
    }

    public observe(type: STEventType, callback: (data: any) => void){
        window.addEventListener(type, (event: any) => {
            callback(event.detail);
        });
    }

    public post(type: STEventType, data?: any){
        window.dispatchEvent(new CustomEvent(type, {
            detail: data
        }));

        getContext().browser.runtime.sendMessage({
            operate: "event/post",
            type: type,
            data: data
        });
    }
}
