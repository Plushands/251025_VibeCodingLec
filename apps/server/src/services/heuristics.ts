import type { EpisodeAnalysis, EpisodeMeta, HighlightPair, TranscriptEntry } from '../types/episode';

const ENCOURAGEMENTS = [
  'Praise the effort and repeat slowly together.',
  'Clap along to the rhythm to help with pronunciation.',
  'Switch roles and let your child lead the phrase.',
  'Add gestures to make the line easier to remember.',
  'Turn it into a short chant and repeat three times.',
  'Use a soft voice first, then a brave voice.',
  'Try saying the line while acting it out.',
  'Ask what the line might mean and rephrase together.',
  'Highlight the key word by stretching it out.',
  'Celebrate with a high-five after repeating.'
];

const CONTEXT_TEMPLATES = [
  'Peppa is sharing a playful moment—echo the line so everyone joins the fun.',
  'This line is great for turn-taking practice between Peppa and Buddy.',
  'Use this moment to emphasize kind, friendly language.',
  'Great opportunity to focus on clear pronunciation of the key words.',
  'Try repeating the phrase with different expressions to build confidence.'
];

function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildPartnerLine(original: string): string {
  if (!original) return 'Let’s try that line together!';
  return `Let’s say: “${original}”`;
}

export function buildHeuristicAnalysis(
  transcript: TranscriptEntry[],
  meta?: EpisodeMeta,
  limit = 10
): EpisodeAnalysis {
  const highlights: HighlightPair[] = [];
  const meaningful = transcript
    .map((entry) => ({
      ts: Number.isFinite(entry.ts) ? entry.ts : 0,
      text: cleanText(entry.text)
    }))
    .filter((entry) => entry.text.length > 0);

  for (let i = 0; i < meaningful.length && highlights.length < limit; i += 1) {
    const entry = meaningful[i];
    const encouragement = ENCOURAGEMENTS[i % ENCOURAGEMENTS.length];
    const context = CONTEXT_TEMPLATES[i % CONTEXT_TEMPLATES.length];
    highlights.push({
      ts: entry.ts,
      childLine: entry.text,
      partnerLine: buildPartnerLine(entry.text),
      context,
      tip: encouragement
    });
  }

  const summary = meta?.title
    ? `Highlights for “${meta.title}” using locally captured Whisper phrases.`
    : 'Highlights generated from the latest Whisper transcript.';

  return {
    highlightPairs: highlights,
    summary
  };
}

export function buildAttemptFeedback(expected: string, attempt: string) {
  const targetWords = cleanText(expected)
    .toLowerCase()
    .split(' ')
    .filter(Boolean);
  const attemptWords = cleanText(attempt)
    .toLowerCase()
    .split(' ')
    .filter(Boolean);

  if (!targetWords.length || !attemptWords.length) {
    return {
      score: 0,
      message: '먼저 한 구절을 골라 함께 읽어보세요!',
      tip: '짧은 문장을 선택해서 천천히 따라 읽도록 도와주세요.'
    };
  }

  const matches = attemptWords.filter((word) => targetWords.includes(word)).length;
  const score = Math.round((matches / targetWords.length) * 100);

  const message =
    score >= 80
      ? '너무 잘했어요! 거의 완벽하게 따라 했어요!'
      : score >= 50
        ? '좋은 시도였어요! 조금만 더 또렷하게 말해볼까요?'
        : '처음에는 어렵지만 괜찮아요. 천천히 한 단어씩 따라 해봐요.';

  const tip =
    score >= 80
      ? '이번에는 감정을 넣어서 연기하듯 말해볼까요?'
      : score >= 50
        ? '모음 소리를 길게 늘려 말하면 훨씬 또렷해져요.'
        : '아이와 함께 입모양을 크게 하면서 천천히 따라 해보세요.';

  return { score, message, tip };
}
