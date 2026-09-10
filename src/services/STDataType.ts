export type STRecordValueType = number | string | object | boolean | null | undefined;

declare global {
    interface Window {
        chrome: any;
        browser: any;
    }
}