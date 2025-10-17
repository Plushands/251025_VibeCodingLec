import { Router } from 'express';
import { generateEpisodeAnalysis } from '../services/analysis';
import { buildHeuristicAnalysis } from '../services/heuristics';
import {
  fetchCaptionsWebVTT,
  fetchVideoMeta
} from '../services/youtube';
import type { TranscriptEntry } from '../types/episode';
import { parseWebVTT } from '../utils/webvtt';

const router = Router();

router.get('/', async (req, res) => {
  const videoId = (req.query.videoId as string | undefined)?.trim();
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId query parameter.' });
    return;
  }

  try {
    const meta = await fetchVideoMeta(videoId);
    const vtt = await fetchCaptionsWebVTT(videoId);
    if (vtt) {
      const transcript = parseWebVTT(vtt);
      if (transcript.length) {
        const { analysis, source } = await generateEpisodeAnalysis(videoId, transcript, meta);
        res.json({
          meta,
          analysis,
          highlightPairs: analysis.highlightPairs,
          message:
            source === 'llm'
              ? 'Used available captions for a quick preview. Whisper capture will add more detail.'
              : 'Quick preview generated locally. Whisper capture will refine the highlights.'
        });
        return;
      }
    }

    res.json({
      meta,
      message: 'No captions found. Play the video and let Whisper capture live audio for highlights.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to analyze video.';
    res.status(500).json({ error: message });
  }
});

router.post('/', async (req, res) => {
  const { videoId, transcript } = req.body as {
    videoId?: string;
    transcript?: TranscriptEntry[];
  };
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId in request body.' });
    return;
  }
  if (!Array.isArray(transcript) || !transcript.length) {
    res.status(400).json({ error: 'Transcript must contain at least one entry.' });
    return;
  }

  const cleaned: TranscriptEntry[] = transcript
    .map((entry) => ({
      text: typeof entry.text === 'string' ? entry.text.trim() : '',
      ts: Number(entry.ts) || 0
    }))
    .filter((entry) => entry.text.length > 0);

  if (!cleaned.length) {
    res.status(400).json({ error: 'Transcript entries were empty after cleaning.' });
    return;
  }

  try {
    const meta = await fetchVideoMeta(videoId);
    const { analysis, source, error: analysisError } = await generateEpisodeAnalysis(
      videoId,
      cleaned,
      meta
    );
    if (analysis.highlightPairs.length === 0) {
      const heuristic = buildHeuristicAnalysis(cleaned, meta);
      res.json({
        meta,
        analysis: heuristic,
        highlightPairs: heuristic.highlightPairs,
        message: 'Unable to create highlight pairs automatically.'
      });
      return;
    }
    res.json({
      meta,
      analysis,
      highlightPairs: analysis.highlightPairs,
      source,
      ...(analysisError ? { warning: analysisError } : {})
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed.';
    res.status(500).json({ error: message });
  }
});

export default router;
