
import { getContext } from "@/services/Context";
export class Storage {
  private static instance: Storage;
  private constructor() {}

  public static init(): Storage {
    if (!Storage.instance) {
        Storage.instance = new Storage();
    }
    // getContext().browser.storage.onChanged.addListener((changes:any, area:any)=>{
    //   console.log(`Change in storage area: ${area}`, changes);
    // });
    return Storage.instance;
  }
  cache: Record<string, any> = {};
  async get(key:string) {
    return new Promise<any>((resolve) => {
      if (key in this.cache) {
        resolve(this.cache[key]);
        return;
      }
      getContext().browser.storage.local.get(key, (result:any) => {
        if (getContext().browser.runtime.lastError) {
          console.error(
              "Failed to query DevTools data",
              getContext().browser.runtime.lastError
          );
          resolve(null);
          return;
        }
        // console.log('get key', key, result)
        const resultValue = result[key];
        if(typeof resultValue === 'undefined'){
          resolve(null);
          return;
        }
        this.cache[key] = resultValue;
        resolve(this.cache[key]);
      });
    });
  }
  async set(key:string, value:any) {
    console.log('storage set key------', key, value)
    this.cache[key] = value;
    // return new Promise<void>((resolve) =>
    //   getContext().browser.storage.local.set({[key]: value}, (res:any) => {
    //     console.log('storage set key response------', key, value, res)
    //     if (getContext().browser.runtime.lastError) {
    //       console.error("Failed to write storage data", getContext().browser.runtime.lastError);
    //     } 
    //     resolve();
    //   })
    // );
      const res = await getContext().browser.storage.local.set({[key]: value});
      console.log('storage set key response------', key, value, res)
  }
  async remove(key:string) {
    this.cache[key] = null;
    return new Promise<void>((resolve) =>
      getContext().browser.storage.local.remove(key, () => {
        if (getContext().browser.runtime.lastError) {
          console.error(
              "Failed to delete DevTools data",
              getContext().browser.runtime.lastError
          );
        } else {
          resolve();
        }
      })
    );
  }
  async has(key: string): Promise<boolean> {
    return Boolean(await this.get(key));
  }


  async writeLocalStorage(values:any) {
    console.log('writeLocalStorage------', values)
    return new Promise((resolve) => {
      getContext().browser.storage.local.set(values, (_res:any) => {
        resolve(values);
      });
    });
  }

  async readLocalStorage(defaults:any) {
    return new Promise((resolve) => {
      getContext().browser.storage.local.get(defaults, (local:any) => {
        // console.log("readLocalStorage---------------local=======", local);
        if (getContext().browser.runtime.lastError) {
          // console.error(context.browser.runtime.lastError.message);
          resolve(defaults);
          return;
        }
        resolve(local);
      });
    });
  }

  async getAll(): Promise<Record<string, any>> {
    try {
      return (await getContext().browser.storage.local.get(null)) as Record<string, any>;
    } catch (e) {
      console.warn("[Storage] getAll failed:", e);
      return {};
    }
  }

  async getByPrefix(prefix: string): Promise<Record<string, any>> {
    const all = await this.getAll();
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith(prefix)) out[k] = v;
    }
    return out;
  }
}