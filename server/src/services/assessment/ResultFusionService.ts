import { AssessmentResult, CloudAsrAssessment, CloudSpeechAssessment, LocalProsodyAssessment } from './types';
import { WordAlignmentService } from './WordAlignmentService';
import { isLikelyWrongScript, PracticeLanguage } from '../PracticeLanguage';
import { assessTargetLanguageNaturalness } from '../TargetLanguageNaturalness';

const roundScore = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const emptyWordTiming = {
  status: 'error' as const,
  summary: '',
  words: [],
};

export class ResultFusionService {
  private readonly wordAlignmentService = new WordAlignmentService();

  fuse(
    local: LocalProsodyAssessment,
    cloud: CloudSpeechAssessment,
    asr: CloudAsrAssessment,
    referenceText: string,
    language: PracticeLanguage = 'en-US',
  ): AssessmentResult {
    const conflictFlags: string[] = [];
    const localSucceeded = local.status !== 'error';
    const cloudSucceeded = cloud.status !== 'error';
    const asrSucceeded =
      asr.status !== 'error' &&
      Boolean(asr.transcript.trim()) &&
      !isLikelyWrongScript(asr.transcript, language);
    const warnings = this.normalizeWarnings(local.features.warnings, asrSucceeded);
    const cloudTranscriptUsable =
      Boolean(cloud.recognizedText.trim()) &&
      !isLikelyWrongScript(cloud.recognizedText, language);
    const finalTranscriptChoice = this.chooseFinalTranscription(
      asrSucceeded ? asr.transcript : '',
      cloudTranscriptUsable ? cloud.recognizedText : '',
      referenceText,
    );
    const finalTranscription = finalTranscriptChoice.transcription;
    const naturalness = assessTargetLanguageNaturalness(finalTranscription, language);
    const buildWordAlignment = (transcription: string) => ({
      referenceText,
      ...this.wordAlignmentService.align(referenceText, transcription, language),
    });

    if (
      asrSucceeded &&
      cloud.recognizedText.trim() &&
      asr.transcript.trim().toLowerCase() !== cloud.recognizedText.trim().toLowerCase()
    ) {
      conflictFlags.push('transcript_gap');
      warnings.push('ASR transcript differs from evaluation transcript.');
    }

    if (asr.status !== 'error' && asr.transcript.trim() && !asrSucceeded) {
      conflictFlags.push('language_mismatch');
      warnings.push('ASR transcript appears to use a different script from the selected practice language.');
    }

    if (cloud.recognizedText.trim() && !cloudTranscriptUsable) {
      conflictFlags.push('cloud_language_mismatch');
      warnings.push('Cloud evaluation transcript appears to use a different script from the selected practice language.');
    }

    if (naturalness.status === 'unnatural') {
      conflictFlags.push('unnatural_target_language');
      warnings.push(naturalness.reason);
    }

    if (localSucceeded && cloudSucceeded) {
      if (Math.abs(local.score - cloud.prosodyScore) >= 25) {
        conflictFlags.push('prosody_gap');
        warnings.push('Local and cloud prosody assessments differ significantly.');
      }

      const finalProsody = roundScore(local.score * 0.6 + cloud.prosodyScore * 0.4);
      const overall = roundScore(cloud.pronunciationScore * 0.6 + finalProsody * 0.4);
      const confidence = roundScore(cloud.confidenceScore * 0.7 + local.confidence * 0.3);

      return {
        status: conflictFlags.length > 0 ? 'partial' : 'success',
        language,
        transcription: finalTranscription,
        scores: {
          pronunciation: cloud.pronunciationScore,
          prosody: finalProsody,
          confidence,
          overall,
        },
        providers: {
          local,
          cloud,
          asr,
        },
        wordTiming: emptyWordTiming,
        naturalness,
        fusion: {
          strategy: finalTranscriptChoice.source === 'asr'
            ? 'asr_primary'
            : (conflictFlags.length > 0 ? 'blended' : 'cloud_primary'),
          chosenTranscriptionSource: finalTranscriptChoice.source,
          scoreWeights: {
            localProsody: 0.6,
            cloudProsody: 0.4,
          },
          conflictFlags,
        },
        warnings,
        learnerSafeSummary: this.buildLearnerSummary(local, cloud, warnings, asrSucceeded),
        wordAlignment: buildWordAlignment(finalTranscription),
      };
    }

    if (localSucceeded) {
      warnings.push('Cloud assessment unavailable; using local prosody fallback.');

      return {
        status: 'partial',
        language,
        transcription: finalTranscription,
        scores: {
          pronunciation: 0,
          prosody: local.score,
          confidence: local.confidence,
          overall: roundScore(local.score * 0.7),
        },
        providers: {
          local,
          cloud,
          asr,
        },
        wordTiming: emptyWordTiming,
        naturalness,
        fusion: {
          strategy: 'local_fallback',
          chosenTranscriptionSource: finalTranscriptChoice.source,
          scoreWeights: {
            localProsody: 1,
            cloudProsody: 0,
          },
          conflictFlags,
        },
        warnings,
        learnerSafeSummary: this.buildLearnerSummary(local, cloud, warnings, asrSucceeded),
        wordAlignment: buildWordAlignment(finalTranscription),
      };
    }

    if (cloudSucceeded) {
      warnings.push('Local prosody analysis unavailable.');

      return {
        status: cloud.status,
        language,
        transcription: finalTranscription,
        scores: {
          pronunciation: cloud.pronunciationScore,
          prosody: cloud.prosodyScore,
          confidence: cloud.confidenceScore,
          overall: roundScore(cloud.pronunciationScore * 0.6 + cloud.prosodyScore * 0.4),
        },
        providers: {
          local,
          cloud,
          asr,
        },
        wordTiming: emptyWordTiming,
        naturalness,
        fusion: {
          strategy: finalTranscriptChoice.source === 'asr' ? 'asr_primary' : 'cloud_only',
          chosenTranscriptionSource: finalTranscriptChoice.source,
          scoreWeights: {
            localProsody: 0,
            cloudProsody: 1,
          },
          conflictFlags,
        },
        warnings,
        learnerSafeSummary: this.buildLearnerSummary(local, cloud, warnings, asrSucceeded),
        wordAlignment: buildWordAlignment(finalTranscription),
      };
    }

    warnings.push('Both local and cloud assessment providers failed.');

    return {
      status: 'error',
      language,
      transcription: '',
      scores: {
        pronunciation: 0,
        prosody: 0,
        confidence: 0,
        overall: 0,
      },
      providers: {
        local,
        cloud,
        asr,
      },
      wordTiming: emptyWordTiming,
      naturalness,
      fusion: {
        strategy: 'failed',
        chosenTranscriptionSource: 'none',
        scoreWeights: {
          localProsody: 0,
          cloudProsody: 0,
        },
        conflictFlags,
      },
      warnings,
      learnerSafeSummary: this.buildLearnerSummary(local, cloud, warnings, asrSucceeded),
      wordAlignment: buildWordAlignment(''),
    };
  }

  private normalizeWarnings(warnings: string[], asrSucceeded: boolean): string[] {
    if (!asrSucceeded) {
      return [...warnings];
    }

    return warnings.filter((warning) => !this.looksLikeNoSpeechMessage(warning));
  }

  private chooseFinalTranscription(
    asrTranscript: string,
    cloudTranscript: string,
    referenceText: string,
  ): { transcription: string; source: AssessmentResult['fusion']['chosenTranscriptionSource'] } {
    if (asrTranscript.trim()) {
      return { transcription: asrTranscript.trim(), source: 'asr' };
    }

    if (cloudTranscript.trim()) {
      return { transcription: cloudTranscript.trim(), source: 'cloud' };
    }

    if (referenceText.trim()) {
      return { transcription: referenceText.trim(), source: 'reference' };
    }

    return { transcription: '', source: 'none' };
  }

  private buildLearnerSummary(
    local: LocalProsodyAssessment,
    cloud: CloudSpeechAssessment,
    warnings: string[],
    asrSucceeded: boolean,
  ): string {
    const parts = [cloud.details, local.summary]
      .map((part) => part.trim())
      .filter((part) => !(asrSucceeded && this.looksLikeNoSpeechMessage(part)))
      .filter(Boolean);

    if (warnings.length > 0) {
      parts.push(warnings.join(' '));
    }

    return parts.join(' ').trim();
  }

  private looksLikeNoSpeechMessage(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    return (
      normalized.includes('no valid speech') ||
      normalized.includes('silent') ||
      normalized.includes('silence') ||
      normalized.includes('未检测到语音') ||
      normalized.includes('未检测到有效语音') ||
      normalized.includes('没有有效语音')
    );
  }
}
