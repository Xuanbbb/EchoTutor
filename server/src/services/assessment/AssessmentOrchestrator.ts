import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ASRService } from '../ASRService';
import { audioDebugService } from '../AudioDebugService';
import { audioPreprocessService } from '../AudioPreprocessService';
import { LocalProsodyAnalyzer } from './providers/LocalProsodyAnalyzer';
import { CloudSpeechEvaluator } from './providers/CloudSpeechEvaluator';
import { CloudAsrProvider } from './providers/CloudAsrProvider';
import { WordTimingAnalyzer } from './providers/WordTimingAnalyzer';
import { ResultFusionService } from './ResultFusionService';
import { AssessmentResult, WordTimingAssessment } from './types';
import { isLikelyWrongScript, PracticeLanguage, resolvePracticeLanguage } from '../PracticeLanguage';
import { WordAlignmentService } from './WordAlignmentService';

export class AssessmentOrchestrator {
  private readonly localAnalyzer = new LocalProsodyAnalyzer();
  private readonly cloudEvaluator = new CloudSpeechEvaluator();
  private readonly asrProvider = new CloudAsrProvider(new ASRService());
  private readonly wordTimingAnalyzer = new WordTimingAnalyzer();
  private readonly fusionService = new ResultFusionService();
  private readonly wordAlignmentService = new WordAlignmentService();

  async assessAudio(
    audioBuffer: Buffer,
    referenceText: string = '',
    debugAudioId?: string,
    language: PracticeLanguage = 'en-US',
  ): Promise<AssessmentResult> {
    const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.input`);
    const preprocessedFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.preprocessed.wav`);

    try {
      await fs.writeFile(tempFilePath, audioBuffer);
      await audioPreprocessService.transcodeToPcmWav(tempFilePath, preprocessedFilePath);

      if (debugAudioId) {
        await audioDebugService.saveFile(
          debugAudioId,
          'preprocessed',
          preprocessedFilePath,
          'preprocessed.wav',
        );
      }

      const normalizedReferenceText = referenceText.trim();
      const resolvedLanguage = resolvePracticeLanguage(language, normalizedReferenceText);

      if (!normalizedReferenceText) {
        const asr = await this.asrProvider.transcribe(preprocessedFilePath, '', debugAudioId, resolvedLanguage);
        const effectiveReferenceText = asr.transcript.trim();
        const [local, cloud] = await Promise.all([
          this.localAnalyzer.analyze(preprocessedFilePath, effectiveReferenceText),
          this.cloudEvaluator.evaluate(preprocessedFilePath, effectiveReferenceText, resolvedLanguage),
        ]);

        const fused = this.fusionService.fuse(local, cloud, asr, effectiveReferenceText, resolvedLanguage);
        const learnerFacing = this.toLearnerFacingAssessment(fused, normalizedReferenceText, resolvedLanguage);
        const wordTiming = this.shouldUseFallbackWordTiming(learnerFacing)
          ? this.buildLanguageMismatchWordTiming(learnerFacing)
          : await this.wordTimingAnalyzer.analyze(
            preprocessedFilePath,
            effectiveReferenceText,
            learnerFacing.transcription,
            resolvedLanguage,
          );

        if (wordTiming.status !== 'error' && wordTiming.words.length > 0) {
          const wordScoreAverage = Math.round(
            wordTiming.words.reduce((sum, word) => sum + word.score, 0) / wordTiming.words.length,
          );
          const adjustedOverall = Math.round(wordScoreAverage * 0.6 + fused.scores.prosody * 0.4);

          return {
            ...learnerFacing,
            scores: {
              ...fused.scores,
              pronunciation: wordScoreAverage,
              overall: adjustedOverall,
            },
            wordTiming,
          };
        }

        return {
          ...learnerFacing,
          wordTiming,
        };
      }

      const [local, cloud, asr] = await Promise.all([
        this.localAnalyzer.analyze(preprocessedFilePath, normalizedReferenceText),
        this.cloudEvaluator.evaluate(preprocessedFilePath, normalizedReferenceText, resolvedLanguage),
        this.asrProvider.transcribe(preprocessedFilePath, normalizedReferenceText, debugAudioId, resolvedLanguage),
      ]);

      const fused = this.fusionService.fuse(local, cloud, asr, normalizedReferenceText, resolvedLanguage);
      const learnerFacing = this.toLearnerFacingAssessment(fused, normalizedReferenceText, resolvedLanguage);
      const wordTiming = this.shouldUseFallbackWordTiming(learnerFacing)
        ? this.buildLanguageMismatchWordTiming(learnerFacing)
        : await this.wordTimingAnalyzer.analyze(
          preprocessedFilePath,
          normalizedReferenceText,
          learnerFacing.transcription,
          resolvedLanguage,
        );

      return {
        ...learnerFacing,
        wordTiming,
      };
    } finally {
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        console.warn('Failed to delete temp file:', error);
      }
      try {
        await fs.unlink(preprocessedFilePath);
      } catch (error) {
        console.warn('Failed to delete preprocessed temp file:', error);
      }
    }
  }

  private toLearnerFacingAssessment(
    assessment: AssessmentResult,
    referenceText: string,
    language: PracticeLanguage,
  ): AssessmentResult {
    const hasLanguageMismatch =
      assessment.fusion.conflictFlags.includes('language_mismatch') ||
      assessment.fusion.conflictFlags.includes('cloud_language_mismatch') ||
      isLikelyWrongScript(assessment.transcription, language);

    if (!hasLanguageMismatch) {
      return assessment;
    }

    const safeTranscription = referenceText.trim();
    const wordAlignment = {
      referenceText,
      ...this.wordAlignmentService.align(referenceText, safeTranscription, language),
    };

    return {
      ...assessment,
      status: 'partial',
      transcription: safeTranscription,
      wordAlignment,
      fusion: {
        ...assessment.fusion,
        chosenTranscriptionSource: safeTranscription ? 'reference' : 'none',
        conflictFlags: Array.from(new Set([
          ...assessment.fusion.conflictFlags,
          'display_transcript_sanitized',
        ])),
      },
      warnings: Array.from(new Set([
        ...assessment.warnings,
        'Displayed transcript was sanitized because ASR used a different script from the selected practice language.',
      ])),
    };
  }

  private shouldUseFallbackWordTiming(assessment: AssessmentResult): boolean {
    return assessment.fusion.conflictFlags.includes('display_transcript_sanitized');
  }

  private buildLanguageMismatchWordTiming(assessment: AssessmentResult): WordTimingAssessment {
    return {
      status: assessment.wordAlignment.tokens.length > 0 ? 'partial' : 'error',
      summary: assessment.wordAlignment.tokens.length > 0
        ? '识别结果偏向其他文字系统，以下词级分数按目标文本保守估计。'
        : '',
      words: assessment.wordAlignment.tokens.map((token) => ({
        expected: token.expected,
        actual: token.status === 'match' ? '' : token.actual,
        status: token.status === 'match' ? 'missing' : token.status,
        startMs: null,
        endMs: null,
        score: token.status === 'match' ? 45 : 28,
        note: 'ASR interpreted the speech as a different writing system.',
      })),
      message: 'ASR language/script mismatch.',
    };
  }
}
