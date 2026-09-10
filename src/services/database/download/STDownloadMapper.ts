import { STMapper } from "../STMapper";
import { STDownloadBean } from "./STDownloadBean";

export class STDownloadMapper extends STMapper{
    public createTable(db: IDBDatabase){
        const store = db.createObjectStore(this.name(), {keyPath: ["uuid", "user_id"]});
        store.createIndex("download_by_user_id", "user_id", {unique: false});
    }

    name(): string {
        return "downloads";
    }

    public async insert(downloadBean: STDownloadBean){
        return await this.db.insert(this.name(), downloadBean.toRecord());
    }

    public async delete(userId: string, uuid: string){
        await this.db.delete(this.name(), [uuid, userId]);
    }

    public async get(userId: string, uuid: string){
        const record = await this.db.get(this.name(), [uuid, userId]);
        if (record){
            return new STDownloadBean().fromRecord(record);
        }
        return null;
    }

    public async list(userId: string){
        const records = await this.db.getByIndex(this.name(), "download_by_user_id", userId);
        const beans: STDownloadBean[] = [];
        for (const record of records){
            beans.push(new STDownloadBean().fromRecord(record));
        }
        return beans;
    }

    public async update(downloadBean: STDownloadBean){
        return await this.db.update(this.name(), downloadBean.toRecord());
    }
}