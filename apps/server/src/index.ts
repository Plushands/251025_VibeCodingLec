import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import morgan from 'morgan';

import analyzeRouter from './routes/analyze';
import feedbackRouter from './routes/feedback';
import sttRouter from './routes/stt';
import suggestionsRouter from './routes/suggestions';

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/suggestions', suggestionsRouter);
app.use('/analyze', analyzeRouter);
app.use('/stt', sttRouter);
app.use('/feedback', feedbackRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error('[Server] Uncaught error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}`);
});
