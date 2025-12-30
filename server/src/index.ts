import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { processAudio } from './controllers/AudioController';

const app = express();
const port = process.env.PORT || 3000;

// Multer setup for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'EchoTutor Backend is running' });
});

// Audio processing route
app.post('/api/process-audio', upload.single('audio'), processAudio);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
