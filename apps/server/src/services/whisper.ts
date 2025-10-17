import { toFile } from 'openai/uploads';
import type { Express } from 'express';
import { getOpenAIClient, isOpenAIConfigured } from './openaiClient';

const DEFAULT_WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'gpt-4o-mini-transcribe';

export function whisperAvailable(): boolean {
  return isOpenAIConfigured();
}

export async function transcribeAudio(file: Express.Multer.File): Promise<string> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('Whisper transcription requires OPENAI_API_KEY.');
  }
  const openaiFile = await toFile(
    file.buffer,
    file.originalname || file.fieldname || 'audio.webm'
  );
  const response = await client.audio.transcriptions.create({
    file: openaiFile,
    model: DEFAULT_WHISPER_MODEL
  });
  return (response.text || '').trim();
}
