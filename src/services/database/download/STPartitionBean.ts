import type { STBeanCoding } from "../STBeanCoding";
import type { STRecordValueType } from "@/services/STDataType";

export class STPartitionBean implements STBeanCoding<STPartitionBean>{
    public uuid: string = '';
    public fileName: string = '';
    public data: any = null;
    public userId: string = '';

    toRecord(): Record<string, STRecordValueType> {
        return {
            uuid: this.uuid,
            file_name: this.fileName,
            data: this.data,
            user_id: this.userId
        };
    }

    fromRecord(record: Record<string, STRecordValueType>): STPartitionBean {
        this.uuid = record["uuid"] as string;
        this.fileName = record["file_name"] as string;
        this.data = record["data"] as any;
        this.userId = record["user_id"] as string;
        return this;
    }
}