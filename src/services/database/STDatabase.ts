import type { STRecordValueType } from '../STDataType';
import { STDatabaseConfiguration } from './STDatabaseConfiguration';

export class STDatabase{
    configuration: STDatabaseConfiguration;
    dbHandler?: IDBDatabase;

    constructor(configuration: STDatabaseConfiguration){
        this.configuration =  configuration;
    }

    protected createObjectStore(dbHandler: IDBDatabase){}

    public async open(){
        return new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open(this.configuration.name!, this.configuration.version);
            
            request.onerror = () => {
                reject(false);
            };

            request.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.dbHandler = db;
                resolve(true);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.configuration.isUpgrade = true;
                this.createObjectStore(db);
            };
        });
    }

    public isOpened(){
        return this.dbHandler != undefined;
    }

    public close(){
        this.dbHandler?.close();
    }

    public hasObjectStore(storeName: string){
        return this.dbHandler?.objectStoreNames.contains(storeName);
    }

    // public createObjectStore(objectStoreName: string,  options?: IDBObjectStoreParameters, createIndex?: (store: IDBObjectStore) => void){
    //     const store = this.dbHandler?.createObjectStore(objectStoreName, options);
    //     if (store && createIndex) {
    //         createIndex(store);
    //     }
    // }


    public async batchInsert(objectStoreName: string, records: Record<string, STRecordValueType>[]){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                for (const record of records){
                    store?.add(record);
                }

                transaction!.oncomplete = () => {
                    resolve(1);
                };

                transaction!.onerror = (error) => {
                    console.error("insert error", error);
                    reject(0);
                };
            });
        }
        return 0;
    }


    public async insert(objectStoreName: string, record: Record<string, STRecordValueType>){
        if (this.isOpened()){
            console.log("insert", objectStoreName, record);
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.add(record);
                
                if(!request) {
                    reject(0);
                    return;
                }
                
                request.onsuccess = () => {
                    resolve(1); 
                };
                
                request.onerror = (result) => {
                    console.log("insert error", result, record);
                    reject(0);
                };
            });
        }
        return 0;
    }

    public async batchUpdate(objectStoreName: string, records: Record<string, STRecordValueType>[]){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                
                if(!store) {
                    reject(0);
                    return;
                }

                let successCount = 0;
                let errorCount = 0;

                for (const record of records) {
                    const request = store.put(record);
                    
                    request.onsuccess = () => {
                        successCount++;
                        if (successCount + errorCount === records.length) {
                            resolve(successCount);
                        }
                    };
                    
                    request.onerror = () => {
                        errorCount++;
                        if (successCount + errorCount === records.length) {
                            resolve(successCount);
                        }
                    };
                }
            });
        }
        return 0;
    }

    public async update(objectStoreName: string, record: Record<string, STRecordValueType>){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.put(record);
                
                if(!request) {
                    reject(false);
                    return;
                }
                
                request.onsuccess = () => {
                    resolve(1); 
                };
                
                request.onerror = () => {
                    reject(0);
                };
            });
        }
        return 0;
    }

    public async get(objectStoreName: string, keyPath: IDBValidKey){
        if (this.isOpened()){
            return new Promise<Record<string, STRecordValueType> | null>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readonly");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.get(keyPath);
                
                if(!request) {
                    reject(null);
                    return;
                }
                
                request.onsuccess = () => {
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    reject(null);
                };
            });
        }
        return null;
    }

    public async batchDelete(objectStoreName: string, keyPaths: IDBValidKey[]) {
        if (this.isOpened()) {
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                let successCount = 0;
                let totalCount = keyPaths.length;
                
                if (totalCount === 0) {
                    resolve(0);
                    return;
                }

                keyPaths.forEach(keyPath => {
                    const request = store?.delete(keyPath);
                    
                    if(!request) {
                        reject(0);
                        return;
                    }
                    
                    request.onsuccess = () => {
                        successCount++;
                        if (successCount === totalCount) {
                            resolve(successCount);
                        }
                    };
                    
                    request.onerror = () => {
                        reject(0);
                    };
                });
            });
        }
        return 0;
    }

    public async delete(objectStoreName: string, keyPath: IDBValidKey){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.delete(keyPath);
                
                if(!request) {
                    reject(0);
                    return;
                }
                
                request.onsuccess = () => {
                    resolve(1);
                };
                
                request.onerror = () => {
                    reject(0);
                };
            });
        }
        return 0;
    }

    public async deleteByIndex(objectStoreName: string, indexName: string, range: IDBKeyRange){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                const index = store?.index(indexName);
                const request = index?.getAllKeys(range);
                
                if(!request) {
                    reject(0);
                    return;
                }
                
                request.onsuccess = () => {
                    const keys = request.result;
                    for (const key of keys){
                        store?.delete(key);
                    }
                    resolve(keys.length);
                };
            });
        }
        return 0;
    }

    public async getFieldEqual(objectStoreName: string, ...args: [string, STRecordValueType][]){
        if (this.isOpened()) {
            return new Promise<Record<string, STRecordValueType>[]>((resolve, reject) => {
                const ret: Record<string, STRecordValueType>[] = [];
                const transaction = this.dbHandler?.transaction(objectStoreName, "readonly");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.openCursor();
                
                if(!request) {
                    reject(ret);
                    return;
                }
                
                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if(cursor) {
                        const match = args.every(([field, value]) => cursor.value[field] === value);
                        if(match) {
                            const result = cursor.value;
                            ret.push(result);
                        }
                        cursor.continue();
                    } else {
                        resolve(ret);
                    }
                };
                
                request.onerror = () => {
                    reject(ret);
                };
            });
        }
        return [];
    }

    public async deleteFieldEqual(objectStoreName: string, ...args: [string, STRecordValueType][]){
        if (this.isOpened()){
            return new Promise<number>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readwrite");
                const store = transaction?.objectStore(objectStoreName);
                const request = store?.openCursor();
                
                if(!request) {
                    reject(0);
                    return;
                }

                request.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest).result;
                    if(cursor) {
                        const match = args.every(([field, value]) => cursor.value[field] === value);
                        if(match) {
                            store?.delete(cursor.key);
                        }
                        cursor.continue();  
                    } else {
                        resolve(1);
                    }
                };

                request.onerror = () => {
                    reject(0);
                };
            });
        }
        return 0;
    }  

    
    public async getByIndex(objectStoreName: string, indexName: string,  keyPath: IDBValidKey){
        if (this.isOpened()) {
            return new Promise<Record<string, STRecordValueType>[]>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readonly");
                const store = transaction?.objectStore(objectStoreName);
                const index = store?.index(indexName);
                const request = index?.getAll(keyPath);

                if (!request) {
                    reject([]);
                    return;
                }

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = () => {
                    reject([]);
                };
            });
        }
        return [];
    }

    public async getByIndexRangeFieldEqual(objectStoreName: string, indexName: string, range: IDBKeyRange, ...args: [string, STRecordValueType][]){
        if (this.isOpened()) {
            return new Promise<Record<string, STRecordValueType>[]>((resolve, reject) => {
                const transaction = this.dbHandler?.transaction(objectStoreName, "readonly");
                const store = transaction?.objectStore(objectStoreName);
                const index = store?.index(indexName);
                const request = index?.getAll(range);

                if (!request) {
                    reject([]);
                    return;
                }

                request.onsuccess = () => {
                    const ret: Record<string, STRecordValueType>[] = [];
                    for (const record of request.result) {
                        const match = args.every(([field, value]) => record[field] === value);
                        if (match) {
                            ret.push(record);
                        }
                    }
                    resolve(ret);
                };

                request.onerror = () => {
                    reject([]);
                };
            });
        }
        return [];
    }

    public async getMaxAutoIncrementIdFieldEqual(objectStoreName: string, ...args: [string, STRecordValueType][]){
        return new Promise<number>((resolve, reject) => {
            const transaction = this.dbHandler?.transaction(objectStoreName, "readonly");
            const store = transaction?.objectStore(objectStoreName);
            const request = store?.openCursor(null, "prev");
            
            request!.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const match = args.every(([field, value]) => cursor.value[field] === value);
                    if (match) {
                        resolve(cursor.key as number);
                        return;
                    }
                    cursor.continue();
                }
                else{
                    resolve(0);
                }
            };

            request!.onerror = () => {
                reject(0);
            };
        });
    }
}



export async function withDatabaseResource<T extends STDatabase>(fn: (...openedResources: T[]) => void | Promise<void>, ...resources: T[]) {
    let openedList: T[] = [];
    for (const resource of resources) {
      const succeed = await resource.open();
      succeed && openedList.push(resource)
    }
  
    const result = fn(...resources);
    if (result instanceof Promise) {
      await result;
    }
  
    for (const opened of openedList) {
      opened.close();
    }
  }