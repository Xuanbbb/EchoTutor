import path from 'path';
import { CloudSpeechAssessment } from '../types';
import { PythonJsonRunner } from '../PythonJsonRunner';

export class CloudSpeechEvaluator {
  private readonly runner: PythonJsonRunner;

  constructor() {
    const scriptPath = path.join(process.cwd(), 'python', 'cloud_eval.py');
    this.runner = new PythonJsonRunner(scriptPath, 120000);
  }

  async evaluate(audioPath: string, referenceText: string): Promise<CloudSpeechAssessment> {
    try {
      const result = await this.runner.run(['--audio', audioPath, '--ref_text', referenceText]);
      const assessment: CloudSpeechAssessment = {
        status: this.toStatus(result.status),
        recognizedText: this.toString(result.recognized_text),
        pronunciationScore: this.toNumber(result.pronunciation_score),
        prosodyScore: this.toNumber(result.prosody_score),
        confidenceScore: this.toNumber(result.confidence_score),
        details: this.toString(result.details),
        processingTimeMs: this.toOptionalNumber(result.processing_time_ms),
        message: this.toOptionalString(result.message),
        rawResponse: this.toOptionalString(result.raw_response),
      };

      if (this.looksLikeFalseNoSpeech(assessment)) {
        assessment.status = 'error';
        assessment.message = assessment.message || 'Cloud speech evaluator returned an empty no-speech result.';
      }

      if (assessment.status === 'error') {
        console.warn('[CloudSpeechEvaluator] Cloud evaluation failed:', {
          message: assessment.message,
          details: assessment.details,
          rawResponse: assessment.rawResponse,
        });
      } else {
        console.log('[CloudSpeechEvaluator] Cloud evaluation succeeded:', {
          recognizedText: assessment.recognizedText,
          pronunciationScore: assessment.pronunciationScore,
          prosodyScore: assessment.prosodyScore,
          confidenceScore: assessment.confidenceScore,
          details: assessment.details,
        });
      }

      return assessment;
    } catch (error) {
      console.warn('[CloudSpeechEvaluator] Runner execution failed:', error);
      return {
        status: 'error',
        recognizedText: '',
        pronunciationScore: 0,
        prosodyScore: 0,
        confidenceScore: 0,
        details: '',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private toStatus(value: unknown): CloudSpeechAssessment['status'] {
    return value === 'success' || value === 'partial' ? value : 'error';
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
    return 0;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    return undefined;
  }

  private toString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
  }

  private looksLikeFalseNoSpeech(assessment: CloudSpeechAssessment): boolean {
    const details = assessment.details.trim().toLowerCase();

    return (
      !assessment.recognizedText.trim() &&
      assessment.pronunciationScore === 0 &&
      assessment.prosodyScore === 0 &&
      (
        !details ||
        details.includes('no valid speech') ||
        details.includes('未检测到语音') ||
        details.includes('未检测到有效语音') ||
        details.includes('没有有效语音')
      )
    );
  }
}
