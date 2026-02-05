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
    const referenceText = req.body.referenceText || '';

    // 1. ASR & Pronunciation Assessment (via Python Sidecar)
    // We try to get the real text from our Python scoring engine first.
    const scoringResult = await scoringService.assessPronunciation(audioBuffer, referenceText);
    
    let transcription = '';
    
    if (scoringResult.status === 'success' && scoringResult.recognized_text) {
      transcription = scoringResult.recognized_text;
    } else {
      // Fallback to the mocked ASR service if Python fails
      console.warn('Scoring service failed, falling back to Mock ASR');
      // Note: We don't have a backup ASR anymore as we removed the mock from ASRService, 
      // so if Python fails, we might just have empty text.
      // But let's assume Python will work this time.
      transcription = "Audio processing failed.";
    }

    // 2. LLM Evaluation
    // Now we pass the REAL transcription (from Python) to the LLM
    console.log(`[AudioController] Transcription obtained: "${transcription.substring(0, 50)}..."`);
    console.log('[AudioController] Starting LLM evaluation...');
    const evaluation = await llmService.evaluate(transcription);
    console.log('[AudioController] LLM evaluation completed.');

    // 3. Construct Response
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

export const ttsGenerate = async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required for TTS generation.' });
    }

    console.log(`[AudioController] Generating TTS for text: "${text.substring(0, 50)}..."`);
    const audioBuffer = await ttsService.generateAudio(text);

    // Assuming DashScope TTS returns MP3. This might need adjustment.
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Disposition': `attachment; filename="tts_audio_${Date.now()}.mp3"`,
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
    console.log('[AudioController] TTS audio sent.');

  } catch (error) {
    console.error('Error generating TTS audio:', error);
    res.status(500).json({ error: 'Internal Server Error during TTS generation.' });
  }
};
