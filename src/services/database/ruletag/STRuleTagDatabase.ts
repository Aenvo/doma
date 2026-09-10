import { STDatabase } from "../STDatabase";
import { STDatabaseConfiguration } from "../STDatabaseConfiguration";
import { STRuleTagMapper } from "./STRuleTagMapper";


export class STRuleTagDatabase extends STDatabase{
    constructor(configuration: STDatabaseConfiguration){
        super(configuration);
    }

    protected createObjectStore(dbHandler: IDBDatabase){
        new STRuleTagMapper(this).createTable(dbHandler);
    }

    public getRuleTagMapper(): STRuleTagMapper{
        return new STRuleTagMapper(this);
    }
}