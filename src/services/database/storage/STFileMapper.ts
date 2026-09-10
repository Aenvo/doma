import { STMapper } from "../STMapper";

export class STFileMapper extends STMapper{
    public createTable(dbHandler: IDBDatabase){
        const store = dbHandler.createObjectStore(this.name(), {keyPath: "path"});
        store.createIndex("file_by_user_id_primary_dir", ["user_id", "primary_dir"], {unique: false});
    }

    name(): string {
        return "files";
    }

    public async insert(path: string, content: string, userId: string, primaryDir: string){
        return await this.db.insert(this.name(), {path: path, content: content, primary_dir: primaryDir, user_id: userId});
    }

    public async upsert(path: string, content: string, userId: string, primaryDir: string){
        return await this.db.update(this.name(), {path: path, content: content, primary_dir: primaryDir, user_id: userId});
    }

    public async get(path: string){
        const record = await this.db.get(this.name(), path);
        if (record){
            return record.content as string ??'';
        }
        return '';
    }

    public async delete(path: string){
        return await this.db.delete(this.name(), path);
    }

    // public async upsert(path: string, content: string, primaryDir: string, userId: string){
    //     if (await this.get(path)){
    //         await this.update(path, content, primaryDir, userId);
    //     }
    //     else{
    //         await this.insert(path, content, primaryDir, userId);
    //     }
    // }

    public async deleteDir(userId: string, primaryDir: string){
        return await this.db.deleteByIndex(this.name(), "file_by_user_id_primary_dir", IDBKeyRange.only([userId, primaryDir]));
    }
}