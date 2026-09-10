import { getContext } from '@/services/Context';

/**
 * 页面视频能力（Open/Pro 共享）：字幕拉取、播放器 seek、页面嗅探消息。
 * Pro 的 UserscriptTools.findVideos / 下载仍用 sniffWebpageVideo。
 */
export class VideoPageTools {
  static async handleCaptionTracks(captionUrl: string) {
    return new Promise((resolve) => {
      if (!captionUrl) {
        console.log('handleCaptionTracks---captionUrl-is-null---', captionUrl);
        resolve(null);
        return;
      }
      console.log('handleCaptionTracks---captionUrl---', captionUrl);
      if (!captionUrl.includes('fmt') || captionUrl.includes('youtube.com')) {
        const urlObj = new URL(captionUrl);
        urlObj.searchParams.set('fmt', 'json3');
        captionUrl = urlObj.href;
      }
      fetch(captionUrl)
        .then((response) => response.text())
        .then((data) => {
          resolve(data);
        })
        .catch((error) => {
          console.error('fetch captionTrack Error:', error);
        });
    });
  }

  public static async findVideosCaption(tabId: number) {
    console.log('findVideosCaption---captionTrackData--tabId-', tabId);
    const startTime = performance.now();
    const videoInfo = (await this.sniffWebpageVideo(tabId, 'caption')) as Record<
      string,
      unknown
    > | null;
    console.log(
      'findVideosCaption---sniffWebpageVideo耗时---',
      `${(performance.now() - startTime).toFixed(2)}ms`,
    );
    console.log('findVideosCaption---videoInfo---', videoInfo);
    if (!videoInfo || (!videoInfo.captionUrl && !videoInfo.captionTrackData)) {
      return null;
    }
    let captionTrackData = videoInfo.captionTrackData;
    if (!captionTrackData) {
      const captionStartTime = performance.now();
      captionTrackData = await this.handleCaptionTracks(videoInfo.captionUrl as string);
      console.log(
        'findVideosCaption---handleCaptionTracks耗时---',
        `${(performance.now() - captionStartTime).toFixed(2)}ms`,
      );
    }
    console.log('findVideosCaption---captionTrackData---', captionTrackData);
    if (!captionTrackData) {
      return null;
    }
    if (typeof captionTrackData === 'string') {
      try {
        return JSON.parse(captionTrackData);
      } catch (error) {
        console.error('findVideosCaption parse JSON error:', error);
        return captionTrackData;
      }
    }
    return captionTrackData;
  }

  /** 将页面播放器 seek 到指定秒数（注入 MAIN world，避免 sendMessage 多 listener 冲突） */
  public static async seekVideoPlayer(tabId: number, seconds: number, videoUuid?: string) {
    const scripting = getContext().browser.scripting as {
      executeScript: (details: unknown) => Promise<Array<{ frameId?: number; result?: unknown }>>;
    };

    const seekInPage = (seekSeconds: number, uuid: string | null) => {
      const agentCursor = document.getElementById('__agent-cursor');
      const agentRing = document.getElementById('__agent-click-ring');
      if (agentCursor) agentCursor.style.opacity = '0';
      if (agentRing) agentRing.style.opacity = '0';
      const g = window as { __hideAgentCursor?: () => void };
      if (typeof g.__hideAgentCursor === 'function') g.__hideAgentCursor();

      const t = Number(seekSeconds);
      if (!Number.isFinite(t) || t < 0) {
        return { ok: false, error: 'invalid seconds' };
      }

      const moviePlayer = document.getElementById('movie_player') as {
        seekTo?: (s: number, allowSeekAhead: boolean) => void;
      } | null;
      if (moviePlayer?.seekTo) {
        try {
          moviePlayer.seekTo(t, true);
          return { ok: true, currentTime: t, provider: 'youtube' };
        } catch (e) {
          console.warn('[seekVideoPlayer] youtube seekTo failed', e);
        }
      }

      let videos = Array.from(document.querySelectorAll('video'));
      if (uuid) {
        const matched = videos.filter((v) => v.getAttribute('stay-video-uuid') === uuid);
        if (matched.length) videos = matched;
      }
      if (!videos.length) {
        return { ok: false, error: 'no video element found' };
      }
      if (videos.length > 1 && !uuid) {
        videos.sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          const aVis = ar.width > 0 && ar.height > 0 ? ar.width * ar.height : 0;
          const bVis = br.width > 0 && br.height > 0 ? br.width * br.height : 0;
          return bVis - aVis;
        });
      }

      const video = videos[0];
      const duration = video.duration;
      const target = Number.isFinite(duration) && duration > 0 ? Math.min(t, duration) : t;
      try {
        video.currentTime = target;
        return {
          ok: true,
          currentTime: video.currentTime,
          duration: Number.isFinite(duration) ? duration : undefined,
          videoUuid: video.getAttribute('stay-video-uuid') || undefined,
        };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    };

    const args = [seconds, videoUuid ?? null] as const;
    const pickBest = (results: Array<{ result?: unknown }> | undefined) => {
      const list = (results ?? [])
        .map((r) => r.result as Record<string, unknown> | undefined)
        .filter(Boolean) as Record<string, unknown>[];
      const okHit = list.find((r) => r.ok === true);
      if (okHit) return okHit;
      return list[0] ?? { ok: false, error: 'no video element found' };
    };

    try {
      const mainResults = await Promise.race([
        scripting.executeScript({
          target: { tabId, allFrames: false },
          world: 'MAIN',
          func: seekInPage,
          args: [...args],
        }),
        new Promise<Array<{ result?: unknown }>>((resolve) => setTimeout(() => resolve([]), 5000)),
      ]);
      const mainHit = pickBest(mainResults);
      if (mainHit.ok === true) return mainHit;

      const allResults = await Promise.race([
        scripting.executeScript({
          target: { tabId, allFrames: true },
          world: 'MAIN',
          func: seekInPage,
          args: [...args],
        }),
        new Promise<Array<{ result?: unknown }>>((resolve) => setTimeout(() => resolve([]), 5000)),
      ]);
      return pickBest(allResults);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  /** 向页面嗅探脚本取视频/字幕信息（最多重试） */
  public static async sniffWebpageVideo(tabId: number, type: string) {
    let attempt = 0;
    const maxAttempts = 3;
    const delay = 2000;
    return new Promise((resolve, reject) => {
      const tryFetch = async () => {
        attempt++;
        console.log(`Attempt ${attempt}/${maxAttempts} to fetch video info for ${tabId}`);
        const result = await this.fetchFindVideoInfo(tabId, type);
        if (result) {
          resolve(result);
          return;
        }
        if (attempt >= maxAttempts) {
          console.log(`Max attempts reached (${maxAttempts}), giving up`);
          reject(new Error(`Failed to fetch video info after ${maxAttempts} attempts`));
          return;
        }
        console.log(`Attempt ${attempt} failed, retrying in ${delay}ms`);
        setTimeout(tryFetch, delay);
      };
      tryFetch();
    });
  }

  private static async fetchFindVideoInfo(tabId: number, type: string) {
    return new Promise((resolve) => {
      getContext().browser.tabs.sendMessage(
        tabId,
        {
          operate: 'findVideos',
          from: 'toolsAgent',
          type: type,
        },
        (response: unknown) => {
          const errmsg = getContext().browser.runtime.lastError?.message;
          if (errmsg) {
            resolve(null);
            console.log('findVideoInfo error------', errmsg);
            return;
          }
          if (response) {
            console.log('findVideoInfo------', response);
            resolve(response);
          } else {
            resolve(null);
          }
        },
      );
    });
  }
}
