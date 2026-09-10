import { STDatabase } from '../STDatabase';
import { STDatabaseConfiguration } from '../STDatabaseConfiguration';
import { STFileMapper } from './STFileMapper';

export class STStorageDatabase extends STDatabase {
    constructor(configuration: STDatabaseConfiguration) {
        super(configuration);
    }

    protected createObjectStore(dbHandler: IDBDatabase){
        new STFileMapper(this).createTable(dbHandler);
    }

    public getFileMapper(){
        return new STFileMapper(this);
    }
}