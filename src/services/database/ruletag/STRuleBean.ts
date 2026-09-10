import type { STRecordValueType } from "../../STDataType";
import type { STBeanCoding } from "../STBeanCoding";

export enum STRuleStatus {
    Disable = 0,
    Enable = 1,
    NotSupported = -1
  }

export class STRuleBean implements STBeanCoding<STRuleBean> {
    rule?: string;
    uuid: string = "";
    filterId?: string;
    status: STRuleStatus = STRuleStatus.Enable;
    recordId: string = "";
    userId: string = "";
    topHost: string = "";

    constructor(){

    }

    toRecord(): Record<string, STRecordValueType> {
        return {
            rule: this.rule,
            uuid: this.uuid,
            filter_id: this.filterId,
            status: this.status,
            record_id: this.recordId,
            user_id: this.userId,
            top_host: this.topHost
        }
    }   

    fromRecord(record: Record<string, STRecordValueType>): STRuleBean {
        this.rule = record["rule"] as string;
        this.uuid = record["uuid"] as string;
        this.filterId = record["filter_id"] as string;
        this.status = record["status"] as STRuleStatus;
        this.recordId = record["record_id"] as string;
        this.userId = record["user_id"] as string;
        this.topHost = record["top_host"] as string;
        return this;
    }
}