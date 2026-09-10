import { STMapper } from "../STMapper";
import { STPartitionBean } from "./STPartitionBean";

export class STPartitionMapper extends STMapper{

    public createTable(db: IDBDatabase){
        const store = db.createObjectStore(this.name(), {keyPath: ["uuid", "file_name", "user_id"]});
        store.createIndex("partition_by_user_id_uuid", ["user_id", "uuid"], {unique: false});
    }

    name(): string {
        return "partitions";
    }

    public async insert(partitionBean: STPartitionBean){
        return await this.db.insert(this.name(), partitionBean.toRecord());
    }

    public async update(partitionBean: STPartitionBean){
        return await this.db.update(this.name(), partitionBean.toRecord());
    }

    public async upsert(partitionBean: STPartitionBean){
        const record = await this.db.get(this.name(), [partitionBean.uuid, partitionBean.fileName, partitionBean.userId]);
        if (record){
            await this.update(partitionBean);
        }
        else{
            await this.insert(partitionBean);
        }
    }

    public async delete(userId: string, uuid: string){
        await this.db.deleteFieldEqual(this.name(), ["user_id", userId], ["uuid", uuid]);
    }

    public async getData(userId: string, uuid: string, fileName: string){
        const record = await this.db.get(this.name(), [uuid, fileName, userId]);
        if (record){
            return record["data"] as any;
        }
        return null;
    }

    public async listDatasWithoutState(userId: string, uuid: string){
        const records = await this.db.getByIndex(this.name(), "partition_by_user_id_uuid", [userId, uuid]);
        const datas: Uint8Array[] = [];
        for (const record of records){
            if (!(record["file_name"] as string).includes("State")) {
                datas.push(record["data"] as Uint8Array);
            }
        }
        return datas;
    }

}
   