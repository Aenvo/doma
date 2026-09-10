import { STMapper } from "../STMapper";
import { STRuleBean, STRuleStatus } from "./STRuleBean";

export class STRuleTagMapper extends STMapper{
    public name(): string {
        return "rules_tag";
    }

    public createTable(db: IDBDatabase) {
        const store = db.createObjectStore(this.name(), {keyPath: ["user_id", "uuid"]});
        store.createIndex("rules_tag_by_user_id", "user_id", {unique: false});
    }

    public async update(ruleBean: STRuleBean){
        return await this.db.update(this.name(), ruleBean.toRecord());
    }

    public async get(userId: string, uuid: string){
        const record = await this.db.get(this.name(), [userId, uuid]);
        return record ? new STRuleBean().fromRecord(record) : null;
    }

    public async delete(userId: string, uuid: string){
        return await this.db.delete(this.name(), [userId, uuid]);
    }


    public async clear(userId: string) {
        const records = await this.db.getByIndex(this.name(), "rules_tag_by_user_id", userId);
        for (const record of records){
            await this.delete(userId, record["uuid"] as string);
        }
    }

    public async batchInsert(ruleList: STRuleBean[]){
        ruleList = ruleList.filter(rule => rule.recordId != null && rule.recordId !== "");
        return await this.db.batchInsert(this.name(), ruleList.map(rule => rule.toRecord()));
    }

    public async count(userId: string){
        const records = await this.db.getByIndex(this.name(), "rules_tag_by_user_id", userId);
        return records.length;
    }

    public async list(userId: string){
        const records = await this.db.getByIndex(this.name(), "rules_tag_by_user_id", userId);
        return records.map(record => new STRuleBean().fromRecord(record)).sort((a, b) => a.id! - b.id!);
    }

    public async listEnabled(userId: string){
        const ruleTags = await this.list(userId);
        return ruleTags.filter(ruleTag => ruleTag.status === STRuleStatus.Enable);
    }
}