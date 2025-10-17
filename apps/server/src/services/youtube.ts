import type { EpisodeMeta } from '../types/episode';

interface ChannelVideo {
  id: string;
  title: string;
  thumbnail?: string;
  publishedAt?: string;
}

const API_BASE = 'https://www.googleapis.com/youtube/v3';

function getApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY ?? null;
}

function iso8601ToSeconds(iso: string): number {
  const matcher = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!matcher) {
    return 0;
  }
  const hours = matcher[1] ? parseInt(matcher[1], 10) : 0;
  const minutes = matcher[2] ? parseInt(matcher[2], 10) : 0;
  const seconds = matcher[3] ? parseInt(matcher[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}

export async function fetchVideoMeta(videoId: string): Promise<EpisodeMeta> {
  const key = getApiKey();
  if (!key) {
    return { title: 'YouTube Video', durationSec: 0 };
  }
  const params = new URLSearchParams({
    id: videoId,
    part: 'snippet,contentDetails',
    key
  });
  const url = `${API_BASE}/videos?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube API error: ${res.status}`);
    }
    const json = (await res.json()) as any;
    const item = json.items?.[0];
    if (!item) {
      throw new Error('Video not found');
    }
    const title = (item.snippet?.title as string | undefined) ?? 'YouTube Video';
    const duration = (item.contentDetails?.duration as string | undefined) ?? 'PT0S';
    const durationSec = iso8601ToSeconds(duration);
    const thumbnail =
      (item.snippet?.thumbnails?.high?.url as string | undefined) ||
      (item.snippet?.thumbnails?.medium?.url as string | undefined);
    return { title, durationSec, thumbnail };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown YouTube error';
    if (message.startsWith('YouTube API error')) {
      return { title: 'YouTube Video', durationSec: 0 };
    }
    throw error;
  }
}

export async function fetchVideoMetas(
  videoIds: string[]
): Promise<Record<string, { durationSec: number }>> {
  const key = getApiKey();
  if (!key || videoIds.length === 0) {
    return {};
  }
  const params = new URLSearchParams({
    id: videoIds.join(','),
    part: 'contentDetails',
    key
  });
  const url = `${API_BASE}/videos?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube API error: ${res.status}`);
    }
    const json = (await res.json()) as any;
    const items = json.items as any[] | undefined;
    if (!items) {
      return {};
    }
    const result: Record<string, { durationSec: number }> = {};
    for (const item of items) {
      const id = item?.id as string | undefined;
      const duration = item?.contentDetails?.duration as string | undefined;
      if (!id || !duration) {
        continue;
      }
      result[id] = { durationSec: iso8601ToSeconds(duration) };
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('YouTube API error')) {
      return {};
    }
    throw error;
  }
}

export async function fetchCaptionsWebVTT(videoId: string): Promise<string | null> {
  const url = `https://video.google.com/timedtext?${new URLSearchParams({
    v: videoId,
    lang: 'en',
    fmt: 'vtt'
  }).toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const text = (await res.text()).trim();
    if (!text || !text.includes('WEBVTT')) {
      return null;
    }
    return text;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[YouTube] Captions fetch failed:', error);
    return null;
  }
}

interface ChannelVideoOptions {
  requireCaptions?: boolean;
}

export async function fetchChannelMediumVideos(
  channelId: string,
  maxResults = 10,
  options: ChannelVideoOptions = {}
): Promise<ChannelVideo[]> {
  const key = getApiKey();
  if (!key) {
    return [];
  }
  const params = new URLSearchParams({
    channelId,
    part: 'snippet',
    order: 'date',
    type: 'video',
    videoDuration: 'medium',
    videoEmbeddable: 'true',
    maxResults: String(maxResults),
    key
  });
  if (options.requireCaptions) {
    params.set('videoCaption', 'closedCaption');
  }
  const url = `${API_BASE}/search?${params.toString()}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`YouTube API error: ${res.status}`);
    }
    const json = (await res.json()) as any;
    const items = json.items as any[] | undefined;
    if (!items?.length) {
      return [];
    }
    const videos: ChannelVideo[] = [];
    for (const item of items) {
      const id = item?.id?.videoId as string | undefined;
      const title = item?.snippet?.title as string | undefined;
      if (!id || !title) {
        continue;
      }
      const thumbnail =
        (item?.snippet?.thumbnails?.medium?.url as string | undefined) ||
        (item?.snippet?.thumbnails?.high?.url as string | undefined);
      const publishedAt = item?.snippet?.publishedAt as string | undefined;
      videos.push({ id, title, thumbnail, publishedAt });
    }
    return videos;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('YouTube API error')) {
      return [];
    }
    throw error;
  }
}
