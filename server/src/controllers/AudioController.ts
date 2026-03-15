import { Request, Response } from 'express';
import { ASRService } from '../services/ASRService';
import { LLMService } from '../services/LLMService';
import { TTSService } from '../services/TTSService';
import { PronunciationResult, ScoringService } from '../services/ScoringService';

const asrService = new ASRService();
const llmService = new LLMService();
const ttsService = new TTSService();
const scoringService = new ScoringService();

const buildRequestId = () => `req_${Date.now()}`;

const buildAnalysis = (transcription: string, scoringResult: PronunciationResult) => ({
  transcription,
  pronunciationScore: scoringResult.pronunciation_score ?? 0,
  prosodyScore: scoringResult.prosody_score ?? 0,
  confidenceScore: scoringResult.confidence_score ?? 0,
  pronunciationAnalysis: scoringResult.detailed_feedback || scoringResult.details || '',
});

export const processAudio = async (req: Request, res: Response) => {
  const requestId = buildRequestId();

  try {
    if (!req.file) {
      res.status(400).json({
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
          pipeline: 'two-stage-llm',
        },
        status: {
          success: false,
          message: 'No audio file provided',
        },
        error: {
          stage: 'input',
          detail: 'The request did not include an audio file.',
        }
      });
      return;
    }

    const audioBuffer = req.file.buffer;
    const referenceText = req.body.referenceText || '';

    const scoringResult = await scoringService.assessPronunciation(audioBuffer, referenceText);

    let transcription = '';

    if (scoringResult.status === 'success' && scoringResult.recognized_text) {
      transcription = scoringResult.recognized_text;
    } else {
      console.warn('Scoring service failed, using fallback transcription text.');
      transcription = 'Audio processing failed.';
    }

    console.log(`[AudioController] Transcription obtained: "${transcription.substring(0, 50)}..."`);
    console.log('[AudioController] Starting LLM evaluation...');
    const evaluation = await llmService.evaluate(transcription, scoringResult);
    console.log('[AudioController] LLM evaluation completed.');

    const analysis = buildAnalysis(transcription, scoringResult);
    const feedback = {
      overallScore: evaluation.score,
      grammarIssues: evaluation.grammarIssues,
      pronunciationFeedback: evaluation.pronunciationFeedback,
      correction: evaluation.correction,
    };

    const result = {
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        pipeline: 'two-stage-llm',
      },
      input: {
        referenceText,
        hasAudio: true,
      },
      analysis,
      feedback,
      status: {
        success: scoringResult.status === 'success',
        message: scoringResult.status === 'success'
          ? 'Audio processed successfully'
          : (scoringResult.message || 'Pronunciation assessment completed with fallback data'),
      },
      ...(scoringResult.status !== 'success' ? {
        error: {
          stage: 'analysis',
          detail: scoringResult.details || scoringResult.message || 'Unknown scoring error',
        }
      } : {}),

      // Backward-compatible fields for the current client.
      transcription,
      scoring: scoringResult,
      evaluation,
    };

    console.log('[AudioController] Sending response to client.');
    res.json(result);
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        pipeline: 'two-stage-llm',
      },
      status: {
        success: false,
        message: 'Internal Server Error',
      },
      error: {
        stage: 'server',
        detail: error instanceof Error ? error.message : 'Unknown error',
      }
    });
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
