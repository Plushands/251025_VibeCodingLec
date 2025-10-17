import { Router } from 'express';
import {
  fetchChannelMediumVideos,
  fetchVideoMeta,
  fetchVideoMetas
} from '../services/youtube';

const router = Router();
const PEPPAPIG_CHANNEL_ID = 'UC9coUxZloJ7PGesv1aJwPNg';

router.get('/', async (_req, res) => {
  try {
    const items = await fetchChannelMediumVideos(PEPPAPIG_CHANNEL_ID, 8);
    if (!items.length) return res.json({ videos: [] });

    const metas = await fetchVideoMetas(items.map((i) => i.id));

    const videos = await Promise.all(
      items.map(async (item) => {
        let durationSec = metas[item.id]?.durationSec ?? 0;
        if (!durationSec) {
          try {
            const meta = await fetchVideoMeta(item.id);
            durationSec = meta.durationSec;
          } catch {
            durationSec = 0;
          }
        }

        return {
          videoId: item.id,
          title: item.title,
          durationSec,
          thumbnail:
            item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
          publishedAt: item.publishedAt
        };
      })
    );

    const filtered = videos.filter(
      (video) => video.durationSec >= 600 && video.durationSec <= 960
    );

    res.json({ videos: filtered });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
