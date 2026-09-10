export class Base64Util {
    public static encodeToString(byteArray: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < byteArray.length; i++) {
          binary += String.fromCharCode(byteArray[i]);
        }
        return btoa(binary);
    }
}