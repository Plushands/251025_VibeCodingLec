export interface TranscriptEntry {
  text: string;
  ts: number;
}

export interface HighlightPair {
  ts: number;
  childLine: string;
  partnerLine: string;
  context: string;
  tip: string;
}

export interface EpisodeMeta {
  title: string;
  durationSec: number;
  thumbnail?: string;
}

export interface EpisodeAnalysis {
  highlightPairs: HighlightPair[];
  summary?: string;
  notes?: string;
}
