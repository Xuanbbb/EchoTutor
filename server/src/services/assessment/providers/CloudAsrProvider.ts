import { ASRService } from '../../ASRService';
import { PracticeLanguage } from '../../PracticeLanguage';
import { CloudAsrAssessment } from '../types';

export class CloudAsrProvider {
  constructor(private readonly asrService: ASRService) {}

  async transcribe(
    audioPath: string,
    referenceText = '',
    debugAudioId?: string,
    language: PracticeLanguage = 'en-US',
  ): Promise<CloudAsrAssessment> {
    const startTime = Date.now();

    try {
      const transcript = await this.asrService.convertFileToText(audioPath, referenceText, debugAudioId, language);
      if (!transcript.trim() || transcript.startsWith('ASR Service error')) {
        return {
          status: 'error',
          transcript: '',
          processingTimeMs: Date.now() - startTime,
          message: transcript || 'ASR transcription failed.',
        };
      }

      return {
        status: 'success',
        transcript,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'error',
        transcript: '',
        processingTimeMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
