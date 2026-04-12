import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ASRService } from '../ASRService';
import { audioDebugService } from '../AudioDebugService';
import { audioPreprocessService } from '../AudioPreprocessService';
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

  async assessAudio(
    audioBuffer: Buffer,
    referenceText: string = '',
    debugAudioId?: string,
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

      const [local, cloud, asr] = await Promise.all([
        this.localAnalyzer.analyze(preprocessedFilePath, referenceText),
        this.cloudEvaluator.evaluate(preprocessedFilePath, referenceText),
        this.asrProvider.transcribe(preprocessedFilePath, referenceText, debugAudioId),
      ]);

      return this.fusionService.fuse(local, cloud, asr, referenceText);
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
}
