import { Router } from 'express';
import multer from 'multer';
import { transcribeAudio, whisperAvailable } from '../services/whisper';

const upload = multer();
const router = Router();

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Missing audio file in form-data field "audio".' });
    return;
  }

  if (!whisperAvailable()) {
    res.status(503).json({
      error: 'Whisper transcription is not configured on the server.',
      message: 'Set OPENAI_API_KEY to enable live transcription.'
    });
    return;
  }

  try {
    const text = await transcribeAudio(req.file);
    res.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed.';
    res.status(500).json({ error: message });
  }
});

export default router;
