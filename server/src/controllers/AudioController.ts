import { Request, Response } from 'express';
import { ASRService } from '../services/ASRService';
import { LLMService } from '../services/LLMService';
import { TTSService } from '../services/TTSService';
import { ScoringService } from '../services/ScoringService';

const asrService = new ASRService();
const llmService = new LLMService();
const ttsService = new TTSService();
const scoringService = new ScoringService();

export const processAudio = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No audio file provided' });
      return; // Ensure we stop execution here
    }

    const audioBuffer = req.file.buffer;

    // 1. ASR & Pronunciation Assessment (via Python Sidecar)
    // We try to get the real text from our Python scoring engine first.
    const scoringResult = await scoringService.assessPronunciation(audioBuffer);
    
    let transcription = '';
    
    if (scoringResult.status === 'success' && scoringResult.recognized_text) {
      transcription = scoringResult.recognized_text;
    } else {
      // Fallback to the mocked ASR service if Python fails
      console.warn('Scoring service failed, falling back to Mock ASR');
      transcription = await asrService.convertToText(audioBuffer);
    }

    // 2. LLM Evaluation
    // Now we pass the REAL transcription (from Python) to the LLM
    console.log(`[AudioController] Transcription obtained: "${transcription.substring(0, 50)}..."`);
    console.log('[AudioController] Starting LLM evaluation...');
    const evaluation = await llmService.evaluate(transcription);
    console.log('[AudioController] LLM evaluation completed.');

    // 3. TTS (Optional)
    // const audioResponse = await ttsService.generateAudio(evaluation.correction);

    const result = {
      transcription,
      scoring: scoringResult,
      evaluation,
    };
    
    console.log('[AudioController] Sending response to client.');
    res.json(result);

  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
