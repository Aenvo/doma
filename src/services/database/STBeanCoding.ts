export interface STBeanCoding<T>{
    toRecord(): Record<string, any>;
    fromRecord(record: Record<string, any>): T;
}