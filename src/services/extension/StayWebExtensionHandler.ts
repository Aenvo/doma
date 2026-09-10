import type { STRecordValueType } from "../STDataType";
import { Handler } from "./Handler";

/**
 * Open：无 userscript 注入。
 * 完整实现由 Pro overlay 覆盖本文件。
 */
export class StayWebExtensionHandler extends Handler {
  public async handle(
    message: any,
    sender: any,
    sendResponse: (response: any) => void,
    _context?: any,
  ) {
    const type = message.operate as string;
    if (type === "background/v3/getInjectFiles") {
      const body: Record<string, any> = {
        jsFiles: new Array<Record<string, STRecordValueType>>(),
        gmApi: "",
        allDependentScripts: {},
      };
      sendResponse({ body });
      return;
    }
    sendResponse({});
  }
}
