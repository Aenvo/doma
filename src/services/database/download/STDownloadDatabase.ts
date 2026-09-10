import { STDatabase } from "../STDatabase";
import { STDatabaseConfiguration } from "../STDatabaseConfiguration";
import { STDownloadMapper } from "./STDownloadMapper";
import { STPartitionMapper } from "./STPartitionMapper";

export class STDownloadDatabase extends STDatabase{
    constructor(configuration: STDatabaseConfiguration){
        super(configuration);
    }

    protected createObjectStore(dbHandler: IDBDatabase){
        new STDownloadMapper(this).createTable(dbHandler);
        new STPartitionMapper(this).createTable(dbHandler);
    }

    public getDownloadMapper(): STDownloadMapper{
        return new STDownloadMapper(this);
    }

    public getPartitionMapper(): STPartitionMapper{
        return new STPartitionMapper(this);
    }
}