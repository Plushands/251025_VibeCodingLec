import { buildHeuristicAnalysis } from './heuristics';
import { llmAvailable, requestEpisodeAnalysis } from './llm';
import type { EpisodeMeta, EpisodeAnalysis, TranscriptEntry } from '../types/episode';

export type AnalysisSource = 'llm' | 'heuristic';

export interface AnalysisResult {
  analysis: EpisodeAnalysis;
  source: AnalysisSource;
  error?: string;
}

export async function generateEpisodeAnalysis(
  videoId: string,
  transcript: TranscriptEntry[],
  meta?: EpisodeMeta
): Promise<AnalysisResult> {
  if (!transcript.length) {
    return {
      analysis: { highlightPairs: [], summary: 'No transcript provided.' },
      source: 'heuristic'
    };
  }

  if (!llmAvailable()) {
    return {
      analysis: buildHeuristicAnalysis(transcript, meta),
      source: 'heuristic'
    };
  }

  try {
    const analysis = await requestEpisodeAnalysis(videoId, transcript, meta);
    return {
      analysis,
      source: 'llm'
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    return {
      analysis: buildHeuristicAnalysis(transcript, meta),
      source: 'heuristic',
      error: message
    };
  }
}
