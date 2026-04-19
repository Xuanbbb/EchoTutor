import { Request, Response } from 'express';
import { LLMService } from '../services/LLMService';
import { TTSService } from '../services/TTSService';
import { audioDebugService, DebugAudioStage } from '../services/AudioDebugService';
import { audioPreprocessService } from '../services/AudioPreprocessService';
import { AssessmentOrchestrator } from '../services/assessment/AssessmentOrchestrator';
import { AssessmentResult } from '../services/assessment/types';
import { normalizePracticeLanguage } from '../services/PracticeLanguage';

const llmService = new LLMService();
const ttsService = new TTSService();
const assessmentOrchestrator = new AssessmentOrchestrator();

const buildRequestId = () => `req_${Date.now()}`;

const buildAnalysis = (assessment: AssessmentResult) => ({
  language: assessment.language,
  transcription: assessment.transcription,
  pronunciationScore: assessment.scores.pronunciation,
  prosodyScore: assessment.scores.prosody,
  confidenceScore: assessment.scores.confidence,
  pronunciationAnalysis: assessment.learnerSafeSummary,
  sourceBreakdown: {
    local: {
      status: assessment.providers.local.status,
      score: assessment.providers.local.score,
      confidence: assessment.providers.local.confidence,
      processingTimeMs: assessment.providers.local.processingTimeMs ?? null,
    },
    asr: {
      status: assessment.providers.asr.status,
      transcript: assessment.providers.asr.transcript,
      processingTimeMs: assessment.providers.asr.processingTimeMs ?? null,
      message: assessment.providers.asr.message || '',
    },
    cloud: {
      status: assessment.providers.cloud.status,
      pronunciationScore: assessment.providers.cloud.pronunciationScore,
      prosodyScore: assessment.providers.cloud.prosodyScore,
      confidenceScore: assessment.providers.cloud.confidenceScore,
      processingTimeMs: assessment.providers.cloud.processingTimeMs ?? null,
    },
  },
  localProsody: {
    score: assessment.providers.local.score,
    confidence: assessment.providers.local.confidence,
    summary: assessment.providers.local.summary,
    features: assessment.providers.local.features,
  },
  wordAlignment: assessment.wordAlignment,
  wordTiming: assessment.wordTiming,
  naturalness: assessment.naturalness,
  cloudAssessment: {
    recognizedText: assessment.providers.cloud.recognizedText,
    details: assessment.providers.cloud.details,
    message: assessment.providers.cloud.message || '',
  },
  fusion: assessment.fusion,
  warnings: assessment.warnings,
});

const toLegacyScoring = (assessment: AssessmentResult) => ({
  // Prefer the fused learner-safe summary because raw provider details may
  // still contain fallback/no-speech text from a failed side provider.
  status: assessment.status === 'error' ? 'error' : 'success',
  recognized_text: assessment.transcription,
  confidence_score: assessment.scores.confidence,
  pronunciation_score: assessment.scores.pronunciation,
  prosody_score: assessment.scores.prosody,
  details: assessment.learnerSafeSummary || assessment.providers.cloud.details,
  detailed_feedback: assessment.learnerSafeSummary,
  message: assessment.warnings[0],
  raw_response: assessment.providers.cloud.rawResponse,
  word_alignment: assessment.wordAlignment,
  providers: assessment.providers,
  fusion: assessment.fusion,
  warnings: assessment.warnings,
});

export const processAudio = async (req: Request, res: Response) => {
  const requestId = buildRequestId();
  const debugAudioId = audioDebugService.createDebugId();

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
    const language = normalizePracticeLanguage(req.body.language);
    const rawExtension = audioPreprocessService.inferExtension(req.file.mimetype, req.file.originalname);

    await audioDebugService.saveBuffer(
      debugAudioId,
      'raw',
      audioBuffer,
      rawExtension,
      req.file.mimetype || 'application/octet-stream',
    );

    const assessment = await assessmentOrchestrator.assessAudio(audioBuffer, referenceText, debugAudioId, language);
    const transcription = assessment.transcription;

    console.log(`[AudioController] Transcription obtained: "${transcription.substring(0, 50)}..."`);
    console.log('[AudioController] Starting LLM evaluation...');
    const evaluation = await llmService.evaluate(assessment);
    console.log('[AudioController] LLM evaluation completed.');

    const analysis = buildAnalysis(assessment);
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
        language: assessment.language,
        hasAudio: true,
      },
      debugAudio: audioDebugService.buildResponse(debugAudioId),
      analysis,
      feedback,
      status: {
        success: assessment.status !== 'error',
        message: assessment.status !== 'error'
          ? 'Audio processed successfully'
          : 'Pronunciation assessment failed across all providers',
      },
      ...(assessment.status === 'error' ? {
        error: {
          stage: 'analysis',
          detail: assessment.warnings.join(' ') || 'Unknown scoring error',
        }
      } : {}),

      // Backward-compatible fields for the current client.
      transcription,
      scoring: toLegacyScoring(assessment),
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

export const getDebugAudio = async (req: Request, res: Response) => {
  const debugId = typeof req.params.debugId === 'string' ? req.params.debugId : '';
  const stage = typeof req.params.stage === 'string' ? req.params.stage as DebugAudioStage : null;

  if (!debugId || !stage || !['raw', 'preprocessed', 'asr-input'].includes(stage)) {
    return res.status(400).json({ error: 'Invalid debug audio request.' });
  }

  const file = await audioDebugService.getFile(debugId, stage);
  if (!file) {
    return res.status(404).json({ error: 'Debug audio not found.' });
  }

  res.type(file.contentType);
  return res.sendFile(file.path);
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
