import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ASRService } from '../ASRService';
import { LocalProsodyAnalyzer } from './providers/LocalProsodyAnalyzer';
import { CloudSpeechEvaluator } from './providers/CloudSpeechEvaluator';
import { CloudAsrProvider } from './providers/CloudAsrProvider';
import { ResultFusionService } from './ResultFusionService';
import { AssessmentResult } from './types';

export class AssessmentOrchestrator {
  private readonly localAnalyzer = new LocalProsodyAnalyzer();
  private readonly cloudEvaluator = new CloudSpeechEvaluator();
  private readonly asrProvider = new CloudAsrProvider(new ASRService());
  private readonly fusionService = new ResultFusionService();

  async assessAudio(audioBuffer: Buffer, referenceText: string = ''): Promise<AssessmentResult> {
    const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.wav`);

    try {
      await fs.writeFile(tempFilePath, audioBuffer);

      const [local, cloud, asr] = await Promise.all([
        this.localAnalyzer.analyze(tempFilePath, referenceText),
        this.cloudEvaluator.evaluate(tempFilePath, referenceText),
        this.asrProvider.transcribe(tempFilePath),
      ]);

      return this.fusionService.fuse(local, cloud, asr, referenceText);
    } finally {
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        console.warn('Failed to delete temp file:', error);
      }
    }
  }
}
