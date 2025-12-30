import { Request, Response } from 'express';
import { ASRService } from '../services/ASRService';
import { LLMService } from '../services/LLMService';
import { TTSService } from '../services/TTSService';

const asrService = new ASRService();
const llmService = new LLMService();
const ttsService = new TTSService();

export const processAudio = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return; // Ensure we stop execution here
    }

    const audioBuffer = req.file.buffer;

    // 1. ASR
    const transcription = await asrService.convertToText(audioBuffer);

    // 2. LLM Evaluation
    const evaluation = await llmService.evaluate(transcription);

    // 3. TTS (Optional: Generate audio for the correction)
    // const audioResponse = await ttsService.generateAudio(evaluation.correction);

    res.json({
      transcription,
      evaluation,
      // audioUrl: ... // If we were serving the TTS file
    });
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
