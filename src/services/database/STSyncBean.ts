import type { STRecordValueType } from "../STDataType";
import type { STBeanCoding } from "./STBeanCoding";

export class STSyncBean implements STBeanCoding<STSyncBean>{
    public id?: number;
    public recordId?: string;
    public deleted?: boolean;
    public userId?: string;
    public changeToken: number = 0;
    public createTime: Date = new Date();
    public updateTime: Date = new Date();
  
    constructor(record?: Record<string, STRecordValueType>) {
        if (record) {
            if (record["id"]) {
                this.id = record["id"] as number;
            } else {
                this.id = 0;
            }
            this.recordId = record["record_id"] as string;
            if (record["deleted"]) {
                this.deleted = record["deleted"] as number == 1;
            } else {
                this.deleted = false;
            }
            this.userId = record["user_id"] as string;
            this.changeToken = record["change_token"] as number;
            if (record["create_time"]) {
                this.createTime = new Date(record["create_time"] as number);
            } else {
                this.createTime = new Date();
            }
        
            if (record["update_time"]) {
                this.updateTime = new Date(record["update_time"] as number);
            } else {
                this.updateTime = new Date();
            }
        }
    }

    fromRecord(record: Record<string, any>): STSyncBean {
        return new STSyncBean(record);
    }
  
    toRecord() {
        const record: Record<string, STRecordValueType> = {};
        if (this.id){
            record["id"] = this.id!;
        }
        record["record_id"] = this.recordId!;
        record["deleted"] = this.deleted! ? 1 : 0;
        record["user_id"] = this.userId!;
        record["change_token"] = this.changeToken!;
        return record;
    }
  }