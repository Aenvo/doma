import { STMapper } from "../STMapper";
import { STRuleDnrBean } from "./STRuleDnrBean";

export class STRuleDnrMapper extends STMapper{
    public name(): string {
        return "rules_ndr";
    }

    public createTable(db: IDBDatabase) {
        const store = db.createObjectStore(this.name(), {keyPath: ["user_id", "uuid"]});
        store.createIndex("rules_ndr_by_user_id", "user_id", {unique: false});
    }

    public async insert(ruleDnrBean: STRuleDnrBean){
        return await this.db.insert(this.name(), ruleDnrBean.toRecord());
    }

    public async update(ruleDnrBean: STRuleDnrBean){
        return await this.db.update(this.name(), ruleDnrBean.toRecord());
    }

    public async get(userId: string, uuid: string){
        const record = await this.db.get(this.name(), [userId, uuid]);
        return record ? new STRuleDnrBean().fromRecord(record) : null;
    }

    public async delete(userId: string, uuid: string){
        return await this.db.delete(this.name(), [userId, uuid]);
    }


    public async clear(userId: string) {
        const records = await this.db.getByIndex(this.name(), "rules_ndr_by_user_id", userId);
        for (const record of records){
            await this.delete(userId, record["uuid"] as string);
        }
    }

    public async batchInsert(ruleList: STRuleDnrBean[]){
        return await this.db.batchInsert(this.name(), ruleList.map(rule => rule.toRecord()));
    }

    public async batchUpsert(ruleList: STRuleDnrBean[]){
        return await this.db.batchUpdate(this.name(), ruleList.map(rule => rule.toRecord()));
    }

    public async count(userId: string){
        const records = await this.db.getByIndex(this.name(), "rules_ndr_by_user_id", userId);
        return records.length;
    }

    public async list(userId: string){
        const records = await this.db.getByIndex(this.name(), "rules_ndr_by_user_id", userId);
        return records.map(record => new STRuleDnrBean().fromRecord(record));
    }
}