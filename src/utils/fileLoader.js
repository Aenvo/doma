// eslint-disable-next-line no-undef
const contextBrowser = typeof browser == "undefined" ?  chrome : browser;


async function getOKResponse(url, mimeType, origin) {
  // console.log("getOKResponse-------url---",url, mimeType, origin)
  const credentials = origin && url.startsWith(`${origin}/`) ? undefined : 'omit';
  const response = await fetch(url, {
    cache: 'force-cache',
    credentials,
    referrer: origin?origin:''
  });
  // console.log("getOKResponse-------url---",url, mimeType, origin, response.headers.get('Content-Type'))
  if (mimeType && !response.headers.get('Content-Type').startsWith(mimeType)) {
    throw new Error(`Mime type=${mimeType} mismatch when loading ${url}, content-type=${response.headers.get('Content-Type')}`);
  }
  if (!response.ok) {
    throw new Error(`Unable to load ${url} ${response.status} ${response.statusText}`);
  }
  return response;
}
async function loadAsDataURL(url, mimeType) {
  try {
    const response = await getOKResponse(url, mimeType);
    // console.log("loadAsText-----", response, url)
    return await readResponseAsDataURL(response);
  } catch (error) {
    console.warn(error)
    return ""
  }
}

async function readAsDataURL(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // base64data
    reader.readAsDataURL(blob);
  });
}


async function readResponseAsDataURL(response) {
  try {
    // console.log('readResponseAsDataURL-----response--------',response)
    const blob = await response.blob();
    // console.log('blob-----------blob-------',blob)

    const dataURL = await readAsDataURL(blob)
    // console.log("dataURL------", dataURL)
    return dataURL;
  } catch (error) {
    console.log(error && error.message ? error.message : error)
    throw new Error(`FileReader readAsDataURL is error ${error && error.message ? error.message : error}`);
  }
}
async function loadAsText(url, mimeType, origin) {
  try {
    const response = await getOKResponse(url, mimeType, origin);
    // console.log("loadAsText-----", response, url)
    return await response.text();
  } catch (error) {
    console.warn(error)
    return ""
  }
  
  
}
function getDuration(time) {
  let duration = 0;
  if (time.seconds) {
    duration += time.seconds * 1000;
  }
  if (time.minutes) {
    duration += time.minutes * 60 * 1000;
  }
  if (time.hours) {
    duration += time.hours * 60 * 60 * 1000;
  }
  if (time.days) {
    duration += time.days * 24 * 60 * 60 * 1000;
  }
  return duration;
}
function getStringSize(value) {
  return value.length * 2;
}
class LimitedCacheStorage {
  constructor() {
    this.QUOTA_BYTES = (navigator.deviceMemory || 4) * 16 * 1024 * 1024;
    this.TTL = getDuration({ minutes: 10 });
    this.ALARM_NAME = 'network';
    this.alarmIsActive = false;

    this.bytesInUse = 0;
    this.records = new Map();
    contextBrowser.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === LimitedCacheStorage.ALARM_NAME) {
        this.alarmIsActive = false;
        this.removeExpiredRecords();
      }
    });
  }
  static ensureAlarmIsScheduled() {
    if (!this.alarmIsActive) {
      contextBrowser.alarms.create(LimitedCacheStorage.ALARM_NAME, {
        delayInMinutes: 1
      });
      this.alarmIsActive = true;
    }
  }
  has(url) {
    return this.records.has(url);
  }
  get(url) {
    if (this.records.has(url)) {
      const record = this.records.get(url);
      record.expires = Date.now() + LimitedCacheStorage.TTL;
      this.records.delete(url);
      this.records.set(url, record);
      return record.value;
    }
    return null;
  }
  set(url, value) {
    LimitedCacheStorage.ensureAlarmIsScheduled();
    const size = getStringSize(value);
    if (size > LimitedCacheStorage.QUOTA_BYTES) {
      return;
    }
    for (const [url, record] of this.records) {
      if (this.bytesInUse + size > LimitedCacheStorage.QUOTA_BYTES) {
        this.records.delete(url);
        this.bytesInUse -= record.size;
      } else {
        break;
      }
    }
    const expires = Date.now() + LimitedCacheStorage.TTL;
    this.records.set(url, { url, value, size, expires });
    this.bytesInUse += size;
  }
  removeExpiredRecords() {
    const now = Date.now();
    for (const [url, record] of this.records) {
      if (record.expires < now) {
        this.records.delete(url);
        this.bytesInUse -= record.size;
      } else {
        break;
      }
    }
    if (this.records.size !== 0) {
      LimitedCacheStorage.ensureAlarmIsScheduled();
    }
  }
}

LimitedCacheStorage.QUOTA_BYTES =
(navigator.deviceMemory || 4) * 16 * 1024 * 1024;
LimitedCacheStorage.TTL = getDuration({minutes: 10});
LimitedCacheStorage.ALARM_NAME = "network";
LimitedCacheStorage.alarmIsActive = false;

export function createFileLoader(){
  const caches = {
    'data-url': new LimitedCacheStorage(),
    'text': new LimitedCacheStorage()
  };
  const loaders = {
    'data-url': loadAsDataURL,
    'text': loadAsText
  };
  async function getUrlData({ url, responseType, mimeType, origin }) {
    // console.log("getUrlData------", url, responseType, mimeType, origin)
    const cache = caches[responseType];
    const load = loaders[responseType];
    if (cache.has(url)) {
      return cache.get(url);
    }
    const data = await load(url, mimeType, origin);
    cache.set(url, data);
    return data;
  }
  return {getUrlData}
}

