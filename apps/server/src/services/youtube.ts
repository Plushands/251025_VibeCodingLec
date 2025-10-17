import fetch from 'node-fetch';

export async function fetchVideoMeta(videoId: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { title: 'YouTube Video', durationSec: 0 };

  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const json = (await res.json()) as any;
    const item = json.items?.[0];
    if (!item) throw new Error('Video not found');
    const title = item.snippet.title as string;
    const duration = item.contentDetails.duration as string;
    const durationSec = iso8601ToSeconds(duration);
    return { title, durationSec };
  } catch (err: any) {
    if (String(err.message).startsWith('YouTube API error')) {
      return { title: 'YouTube Video', durationSec: 0 };
    }
    throw err;
  }
}

export async function fetchVideoMetas(videoIds: string[]) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || videoIds.length === 0) return {};
  const chunk = videoIds.join(',');
  const url = `https://www.googleapis.com/youtube/v3/videos?id=${chunk}&part=contentDetails&key=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`);
    const json = (await res.json()) as any;
    const items = json.items as any[] | undefined;
    if (!items) return {};
    const result: Record<string, { durationSec: number }> = {};
    for (const item of items) {
      const id = item?.id as string | undefined;
      const duration = item?.contentDetails?.duration as string | undefined;
      if (!id || !duration) continue;
      result[id] = { durationSec: iso8601ToSeconds(duration) };
    }
    return result;
  } catch (err: any) {
    if (String(err.message).startsWith('YouTube API error')) {
      return {};
    }
    throw err;
  }
}

export async function fetchCaptionsWebVTT(videoId: string) {
  return null as string | null;
}

export async function fetchChannelMediumVideos(channelId: string, maxResults = 10) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];
  const url = `https://www.googleapis.com/youtube/v3/search?channelId=${channelId}&part=snippet&order=date&type=video&videoDuration=medium&videoEmbeddable=true&maxResults=${maxResults}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as any;
  const items = json.items as any[] | undefined;
  if (!items?.length) return [];
  const results: { id: string; title: string; thumbnail?: string; publishedAt?: string }[] = [];
  for (const item of items) {
    const id = item?.id?.videoId as string | undefined;
    const title = item?.snippet?.title as string | undefined;
    if (!id || !title) continue;
    const thumbnail =
      (item?.snippet?.thumbnails?.medium?.url as string | undefined) ||
      (item?.snippet?.thumbnails?.high?.url as string | undefined);
    const publishedAt = item?.snippet?.publishedAt as string | undefined;
    results.push({ id, title, thumbnail, publishedAt });
  }
  return results;
}

function iso8601ToSeconds(iso: string) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  const hours = m?.[1] ? parseInt(m[1], 10) : 0;
  const minutes = m?.[2] ? parseInt(m[2], 10) : 0;
  const seconds = m?.[3] ? parseInt(m[3], 10) : 0;
  return hours * 3600 + minutes * 60 + seconds;
}
