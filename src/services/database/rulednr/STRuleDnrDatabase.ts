import { STDatabase } from "../STDatabase";
import { STDatabaseConfiguration } from "../STDatabaseConfiguration";
import { STRuleDnrMapper } from "./STRuleDnrMapper";


export class STRuleDnrDatabase extends STDatabase{
    constructor(configuration: STDatabaseConfiguration){
        super(configuration);
    }

    protected createObjectStore(dbHandler: IDBDatabase){
        new STRuleDnrMapper(this).createTable(dbHandler);
    }

    public getRuleDnrMapper(): STRuleDnrMapper{
        return new STRuleDnrMapper(this);
    }
}