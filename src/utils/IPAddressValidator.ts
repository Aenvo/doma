export class IPAddressValidator{
    private static IPv4_PATTERN: RegExp = /^([0-9]{1,3}\.){3}[0-9]{1,3}(?::\d{1,5})?$/;
    private static IPv6_PATTERN: RegExp = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(?::\d{1,5})?$/;
  
    public static isValidIP(ip: string): boolean{
      if (ip.startsWith("http://")
        || ip.startsWith("https://")
        || ip.startsWith("ftp://")
        || ip.startsWith("ws://")
        || ip.startsWith("wws://")){
        ip = ip.split("://")[1];
      }
      if (IPAddressValidator.IPv4_PATTERN.test(ip)){
        return IPAddressValidator.validateIPv4(ip.split(":")[0]);
      }
  
      if (IPAddressValidator.IPv6_PATTERN.test(ip)){
        return true;
      }
  
      return false;
    }
  
    static validateIPv4(ip: string): boolean{
      const parts = ip.split("\\.");
      for (const part of parts){
        const intPart = parseInt(part);
        if (intPart < 0 || intPart > 255){
          return false;
        }
      }
  
      return true;
    }
  
  }