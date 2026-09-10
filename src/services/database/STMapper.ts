import { STDatabase } from "./STDatabase";

export abstract class STMapper {
    db: STDatabase;
    
    constructor(db: STDatabase) {
        this.db = db;
    }

    abstract name(): string;

    abstract createTable(dbHandler: IDBDatabase): void;
}