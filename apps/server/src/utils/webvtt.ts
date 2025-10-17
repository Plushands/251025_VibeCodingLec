import type { TranscriptEntry } from '../types/episode';

const TIMECODE_PATTERN =
  /(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<milliseconds>\d{3})/;

function parseTimecode(value: string): number | null {
  const match = TIMECODE_PATTERN.exec(value);
  if (!match || !match.groups) {
    return null;
  }
  const hours = Number(match.groups.hours ?? 0);
  const minutes = Number(match.groups.minutes ?? 0);
  const seconds = Number(match.groups.seconds ?? 0);
  const millis = Number(match.groups.milliseconds ?? 0);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

export function parseWebVTT(source: string): TranscriptEntry[] {
  const chunks = source
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean);

  const results: TranscriptEntry[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split('\n').filter(Boolean);
    if (lines.length < 2) {
      continue;
    }
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex === -1) {
      continue;
    }
    const timeLine = lines[timeLineIndex];
    const [startRaw] = timeLine.split('-->').map((item) => item.trim());
    const ts = parseTimecode(startRaw);
    if (ts === null) {
      continue;
    }
    const textLines = lines.slice(timeLineIndex + 1);
    const text = textLines.join(' ').trim();
    if (!text) {
      continue;
    }
    results.push({ ts, text });
  }

  results.sort((a, b) => a.ts - b.ts);
  return results;
}
