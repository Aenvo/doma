// import { type StoreOptions } from './StoreType';
import { Storage } from './Storage';

type MutationHandler<S, P> = (state: S, payload: P) => void;
type ActionHandler<S, R> = (context: ActionContext<S>, payload?: any) => Promise<R> | R;
type GetterHandler<S, R> = (state: S) => R;

interface ActionContext<S> {
  state: S;
  commit: (mutation: string, payload?: any) => Promise<void>;
  dispatch: (action: string, payload?: any) => Promise<any>;
}

interface StoreOptions<S> {
  state: S;
  mutations?: Record<string, MutationHandler<S, any>>;
  actions?: Record<string, ActionHandler<S, any>>;
  getters?: Record<string, GetterHandler<S, any>>;
  persist?: string[]; // 需要持久化的 state 字段名
}

export class Store<S extends object> {
  private static instance: Store<any>;
  private _state: S;
  private _mutations: Record<string, MutationHandler<S, any>>;
  private _actions: Record<string, ActionHandler<S, any>>;
  private _getters: Record<string, GetterHandler<S, any>>;
  private _storage: any;
  private _persisted_storage_key: string;
  private _persistKeys: string[];

  private constructor(options: StoreOptions<S>) {
    this._mutations = options.mutations || {};
    this._actions = options.actions || {};
    this._getters = options.getters || {};
    this._persistKeys = options.persist || [];
    this._storage = window.localStorage;
    this._persisted_storage_key = '_stay_persisted_store_';
    // 3. 安全地初始化 Proxy
    this._state = this._createProxyState(options.state)
    
    // 从 storage 恢复持久化状态
    this._restorePersistedState();
  }

  private _createProxyState(state: S): S {
    return new Proxy(state, {
      set: (target: S, key: string | symbol, value: any) => {
        // 4. 类型安全地设置属性
        if (typeof key === 'string' && key in target) {
          const typedKey = key as keyof S;
          target[typedKey] = value;
          if(!this._storage){
            this._storage = window.localStorage
          }
          // 5. 安全地进行持久化
          if (this._persistKeys.includes(key) && this._storage) {
            let persistedVal = this._storage?.getItem(this._persisted_storage_key);
            if(persistedVal){
              persistedVal = JSON.parse(persistedVal);
            }else{
              persistedVal = {};
            }
            persistedVal[key] = value;
            this._storage?.setItem(this._persisted_storage_key, JSON.stringify(persistedVal));
          }
          return true;
        }
        return false;
      },
      get: (target: S, key: string | symbol) => {
        console.log("_createProxyState------", target)
        // 确保属性存在
        if (typeof key === 'string' && key in target) {
          let defaultValue = target[key as keyof S];
          const storageVal = this.getStorageByKey(key);
          if(storageVal !== undefined && JSON.stringify(storageVal) !== JSON.stringify(defaultValue)){
            defaultValue = storageVal;
          }
          return defaultValue;
        }
        return undefined; // 或不存在的key返回undefined
      },
    });
  }

  private getStorageByKey(key: string){
    let defaultValue = undefined;
    if(!this._storage){
      this._storage = window.localStorage
    }
    if (this._persistKeys.includes(key) && this._storage) {
      let persistedVal = this._storage?.getItem(this._persisted_storage_key);
      if(persistedVal){
        persistedVal = JSON.parse(persistedVal);
        return typeof persistedVal[key] != undefined ? persistedVal[key] : defaultValue;
      }else{
        return defaultValue;
      }
    }
    return defaultValue;
  }

  public static create<S extends object>(options: StoreOptions<S>): Store<S> {
    if (!Store.instance) {
      Store.instance = new Store(options);
    }
    return Store.instance as Store<S>;
  }

  private async _restorePersistedState(): Promise<void> {
    for (const key of this._persistKeys) {
      const value = this.getStorageByKey(key);
      if (value !== undefined && value !== null) {
        this._state[key as keyof S] = value;
      }
    }
  }

  get state(): S {
    return this._state;
  }

  async commit(mutation: string, payload?: any): Promise<void> {
    const handler = this._mutations[mutation];
    if (!handler) {
      throw new Error(`Unknown mutation: ${mutation}`);
    }
    handler(this._state, payload);
  }

  async dispatch(action: string, payload?: any): Promise<any> {
    const handler = this._actions[action];
    if (!handler) {
      throw new Error(`Unknown action: ${action}`);
    }
    const context: ActionContext<S> = {
      state: this._state,
      commit: this.commit.bind(this),
      dispatch: this.dispatch.bind(this)
    };
    return Promise.resolve(handler(context, payload));
  }

  getters(): Record<string, any> {
    const getters: Record<string, any> = {};
    for (const key in this._getters) {
      getters[key] = this._getters[key](this._state);
    }
    return getters;
  }
}