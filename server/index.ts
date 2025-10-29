import express from 'express';
import { join } from 'path';
import cors from 'cors';
import importRouter from './routes/import';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Public (import.html vs.)
app.use(express.static(join(process.cwd(), 'public')));

// Routes
app.use('/api/import', importRouter);

// Health
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[API] on :${PORT}`));


