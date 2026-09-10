import { getContext } from "../Context";

let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let mediaStream: MediaStream | null = null;

function cleanupRecording() {
  mediaRecorder = null;
  recordedChunks = [];
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
}

function isRecordableTabUrl(url: string | undefined): boolean {
  if (!url) return false;
  const lower = url.trim().toLowerCase();
  if (
    lower.startsWith("chrome://")
    || lower.startsWith("chrome-extension://")
    || lower.startsWith("edge://")
    || lower.startsWith("about:")
    || lower.startsWith("devtools://")
  ) {
    return false;
  }
  return lower.startsWith("http://") || lower.startsWith("https://");
}

async function resolveTargetTabId(preferredTabId?: number): Promise<number | undefined> {
  const browser = getContext().browser;

  if (typeof preferredTabId === "number" && preferredTabId > 0) {
    try {
      const tab = await browser.tabs.get(preferredTabId);
      if (tab?.id && isRecordableTabUrl(typeof tab.url === "string" ? tab.url : undefined)) {
        return tab.id;
      }
    } catch {
      // fall through
    }
  }

  const queries: Array<{ active: boolean; lastFocusedWindow?: boolean; currentWindow?: boolean }> = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
  ];

  for (const query of queries) {
    const tabs = await browser.tabs.query(query);
    const tab = tabs[0];
    if (tab?.id && isRecordableTabUrl(typeof tab.url === "string" ? tab.url : undefined)) {
      return tab.id;
    }
  }

  return undefined;
}

async function ensureTabAccess(tabId: number): Promise<void> {
  const browser = getContext().browser;
  if (!browser.scripting?.executeScript) return;
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: () => true,
    });
  } catch {
    // host_permissions 已覆盖时通常可忽略
  }
}

export function isTabRecordingActive(): boolean {
  return mediaRecorder?.state === "recording";
}

export async function startActiveTabRecording(
  options?: { tabId?: number },
): Promise<{ ok: true; tabId: number } | { ok: false; error: string }> {
  if (isTabRecordingActive()) {
    return { ok: false, error: "already recording" };
  }

  const browser = getContext().browser;
  if (!browser.tabCapture?.getMediaStreamId) {
    return { ok: false, error: "tabCapture unavailable" };
  }

  const tabId = await resolveTargetTabId(options?.tabId);
  if (!tabId) {
    return { ok: false, error: "no recordable active tab" };
  }

  try {
    await ensureTabAccess(tabId);

    const streamId = await browser.tabCapture.getMediaStreamId({
      targetTabId: tabId,
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    } as unknown as MediaStreamConstraints);

    recordedChunks = [];
    mediaStream = stream;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "";

    mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    mediaRecorder.start(1000);
    return { ok: true, tabId };
  } catch (error) {
    cleanupRecording();
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function stopActiveTabRecordingAndDownload(): Promise<{ ok: true } | { ok: false; error: string }> {
  const recorder = mediaRecorder;
  if (!recorder || recorder.state !== "recording") {
    return { ok: false, error: "not recording" };
  }

  const browser = getContext().browser;
  const mimeType = recorder.mimeType || "video/webm";

  return await new Promise((resolve) => {
    recorder.onstop = async () => {
      try {
        const blob = new Blob(recordedChunks, { type: mimeType });
        if (!blob.size) {
          cleanupRecording();
          resolve({ ok: false, error: "empty recording" });
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        await browser.downloads.download({
          url: objectUrl,
          filename: `doma-tab-recording-${timestamp}.webm`,
          saveAs: false,
        });
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
        cleanupRecording();
        resolve({ ok: true });
      } catch (error) {
        cleanupRecording();
        resolve({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    recorder.stop();
  });
}

export function cancelActiveTabRecording() {
  const recorder = mediaRecorder;
  if (recorder && recorder.state === "recording") {
    recorder.onstop = () => cleanupRecording();
    recorder.stop();
    return;
  }
  cleanupRecording();
}
