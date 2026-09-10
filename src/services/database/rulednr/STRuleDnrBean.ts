import type { STRecordValueType } from "../../STDataType";
import type { STBeanCoding } from "../STBeanCoding";

/** DNR 规则序列化 JSON（序列化 JSON，无 Rule 类依赖） */
export type STRuleDnrRuleJson = Record<string, unknown>;

export class STRuleDnrBean implements STBeanCoding<STRuleDnrBean> {
    rule?: STRuleDnrRuleJson;
    uuid: string = "";
    userId: string = "";
    topHostList: string[] = [];

    constructor(){

    }

    toRecord(): Record<string, STRecordValueType> {
        return {
            uuid: this.uuid,
            rule: this.rule as STRecordValueType,
            user_id: this.userId,
            top_host_list: this.topHostList
        }
    }   

    fromRecord(record: Record<string, STRecordValueType>): STRuleDnrBean {
        this.uuid = record["uuid"] as string;
        const ruleJson = record["rule"];
        this.rule =
            ruleJson && typeof ruleJson === "object" && !Array.isArray(ruleJson)
                ? (ruleJson as STRuleDnrRuleJson)
                : undefined;
        this.userId = record["user_id"] as string ?? "";
        this.topHostList = record["top_host_list"] as string[] ?? [];
        return this;
    }
}
