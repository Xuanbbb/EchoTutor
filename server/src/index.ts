import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { processAudio, ttsGenerate } from './controllers/AudioController';
import {
  listScenarios,
  replyScenarioConversation,
  startScenarioConversation,
} from './controllers/ScenarioController';

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

// TTS generation route
app.post('/api/tts-generate', ttsGenerate);
app.get('/api/scenarios', listScenarios);
app.post('/api/scenarios/start', startScenarioConversation);
app.post('/api/scenarios/reply', upload.single('audio'), replyScenarioConversation);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
