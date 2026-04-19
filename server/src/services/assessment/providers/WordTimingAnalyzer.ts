import path from 'path';
import { PronunciationGuideService } from '../../PronunciationGuideService';
import { PythonJsonRunner } from '../PythonJsonRunner';
import { WordTimingAssessment, WordTimingAssessmentWord } from '../types';
import { PracticeLanguage } from '../../PracticeLanguage';

export class WordTimingAnalyzer {
  private readonly runner: PythonJsonRunner;
  private readonly pronunciationGuideService = new PronunciationGuideService();

  constructor() {
    const scriptPath = path.join(process.cwd(), 'python', 'word_timing.py');
    this.runner = new PythonJsonRunner(scriptPath, 30000);
  }

  async analyze(
    audioPath: string,
    referenceText: string,
    transcript: string,
    language: PracticeLanguage = 'en-US',
  ): Promise<WordTimingAssessment> {
    try {
      const result = await this.runner.run([
        '--audio',
        audioPath,
        '--ref_text',
        referenceText,
        '--transcript',
        transcript,
        '--language',
        language,
      ]);
      const words = Array.isArray(result.words)
        ? result.words.map((word) => this.toWord(word))
        : [];

      return {
        status: this.toStatus(result.status),
        summary: this.toString(result.summary),
        words,
        processingTimeMs: this.toOptionalNumber(result.processing_time_ms),
        message: this.toOptionalString(result.message),
      };
    } catch (error) {
      return {
        status: 'error',
        summary: '',
        words: [],
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private toWord(value: unknown): WordTimingAssessmentWord {
    const word = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
    const expected = this.toString(word.expected);

    return {
      expected,
      actual: this.toString(word.actual),
      status: this.toWordStatus(word.status),
      startMs: this.toNullableNumber(word.start_ms),
      endMs: this.toNullableNumber(word.end_ms),
      score: this.toScore(word.score),
      ipa: expected ? this.pronunciationGuideService.toIpa(expected) : '',
      note: this.toOptionalString(word.note),
    };
  }

  private toStatus(value: unknown): WordTimingAssessment['status'] {
    return value === 'success' || value === 'partial' ? value : 'error';
  }

  private toWordStatus(value: unknown): WordTimingAssessmentWord['status'] {
    return value === 'match' || value === 'missing' || value === 'extra' || value === 'substituted'
      ? value
      : 'missing';
  }

  private toString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private toOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value ? value : undefined;
  }

  private toNullableNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  }

  private toScore(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.min(100, Math.round(value)))
      : 0;
  }
}
