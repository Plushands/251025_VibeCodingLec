import { Router } from 'express';
import { buildAttemptFeedback } from '../services/heuristics';

const router = Router();

router.post('/', (req, res) => {
  const { expected, attempt } = req.body as { expected?: string; attempt?: string };
  if (!expected || !attempt) {
    res.status(400).json({ error: 'expected and attempt fields are required.' });
    return;
  }
  const feedback = buildAttemptFeedback(expected, attempt);
  res.json(feedback);
});

export default router;
