import path from 'path';
import { LocalProsodyAssessment, LocalProsodyFeatures } from '../types';
import { PythonJsonRunner } from '../PythonJsonRunner';

const emptyFeatures: LocalProsodyFeatures = {
  durationSeconds: 0,
  speechRatio: 0,
  pauseCount: 0,
  averagePauseMs: 0,
  energyVariation: 0,
  speechRate: 0,
  warnings: [],
};

export class LocalProsodyAnalyzer {
  private readonly runner: PythonJsonRunner;

  constructor() {
    const scriptPath = path.join(process.cwd(), 'python', 'local_prosody.py');
    this.runner = new PythonJsonRunner(scriptPath, 30000);
  }

  async analyze(audioPath: string, referenceText: string): Promise<LocalProsodyAssessment> {
    try {
      const result = await this.runner.run(['--audio', audioPath, '--ref_text', referenceText]);

      return {
        status: this.toStatus(result.status),
        score: this.toNumber(result.score),
        confidence: this.toNumber(result.confidence),
        summary: this.toString(result.summary),
        features: {
          durationSeconds: this.toNumber(result.duration_seconds),
          speechRatio: this.toNumber(result.speech_ratio),
          pauseCount: this.toNumber(result.pause_count),
          averagePauseMs: this.toNumber(result.average_pause_ms),
          energyVariation: this.toNumber(result.energy_variation),
          speechRate: this.toNumber(result.speech_rate),
          warnings: Array.isArray(result.warnings) ? result.warnings.map(String) : [],
        },
        processingTimeMs: this.toOptionalNumber(result.processing_time_ms),
        message: this.toOptionalString(result.message),
      };
    } catch (error) {
      return {
        status: 'error',
        score: 0,
        confidence: 0,
        summary: '',
        features: emptyFeatures,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private toStatus(value: unknown): LocalProsodyAssessment['status'] {
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
}
