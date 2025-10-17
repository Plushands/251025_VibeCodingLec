import { getOpenAIClient, isOpenAIConfigured } from './openaiClient';
import { buildHeuristicAnalysis } from './heuristics';
import type { EpisodeAnalysis, EpisodeMeta, TranscriptEntry } from '../types/episode';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini';

function formatTranscriptForPrompt(entries: TranscriptEntry[]): string {
  const limit = Number(process.env.LLM_TRANSCRIPT_LIMIT ?? 24);
  return entries
    .slice(-limit)
    .map((entry) => {
      const minutes = Math.floor(entry.ts / 60)
        .toString()
        .padStart(2, '0');
      const seconds = Math.floor(entry.ts % 60)
        .toString()
        .padStart(2, '0');
      return `[${minutes}:${seconds}] ${entry.text}`;
    })
    .join('\n');
}

export function llmAvailable(): boolean {
  return isOpenAIConfigured();
}

export async function requestEpisodeAnalysis(
  videoId: string,
  transcript: TranscriptEntry[],
  meta?: EpisodeMeta
): Promise<EpisodeAnalysis> {
  const heuristic = buildHeuristicAnalysis(transcript, meta);
  const client = getOpenAIClient();
  if (!client) {
    return heuristic;
  }

  const transcriptText = formatTranscriptForPrompt(transcript);
  if (!transcriptText) {
    return heuristic;
  }

  const schemaDescription = JSON.stringify(
    {
      highlightPairs: [
        {
          ts: 12,
          childLine: 'Peppa shows me her toy.',
          partnerLine: "Let's try saying it together!",
          context: 'Use this line to encourage sharing vocabulary.',
          tip: 'Exaggerate the vowels to make it easier to hear.'
        }
      ],
      summary: 'Short summary of the episode focus.',
      notes: 'Optional coaching notes.'
    },
    null,
    2
  );

  const prompt = [
    `Video title: ${meta?.title ?? 'Unknown Peppa Pig episode'}`,
    `Video duration: ${meta?.durationSec ?? 0} seconds`,
    '',
    'Audience: Korean parent practicing English with a 4-year-old child.',
    'Goal: pick playful highlight phrases that are short, positive, and easy to repeat.',
    'Constraints:',
    '- Use only the provided transcript lines verbatim.',
    '- Provide exactly one playful partner response per child line.',
    '- Context and tips should be concise and encouraging. Keep under 140 characters.',
    '',
    'Return a strict JSON object with this layout (no markdown, no commentary):',
    schemaDescription,
    '',
    'Transcript:',
    transcriptText
  ].join('\n');

  try {
    const response = await client.responses.create({
      model: DEFAULT_MODEL,
      input: [
        {
          role: 'system',
          content:
            'You are a playful English tutor helping families practice short Peppa Pig phrases together. Respond in JSON following the provided schema.'
        },
        { role: 'user', content: prompt }
      ]
    });

    const jsonText = response.output_text;
    if (!jsonText) {
      return heuristic;
    }
    const parsed = JSON.parse(jsonText) as EpisodeAnalysis;
    if (!parsed.highlightPairs?.length) {
      return heuristic;
    }
    // Ensure timestamps are finite numbers
    parsed.highlightPairs = parsed.highlightPairs.map((pair) => ({
      ts: Number.isFinite(pair.ts) ? pair.ts : 0,
      childLine: pair.childLine,
      partnerLine: pair.partnerLine,
      context: pair.context,
      tip: pair.tip
    }));
    return parsed;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[LLM] Falling back to heuristic analysis:', error);
    return heuristic;
  }
}
