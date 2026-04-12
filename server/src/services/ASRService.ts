import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { audioDebugService } from './AudioDebugService';
import { audioPreprocessService } from './AudioPreprocessService';

export class ASRService {
  private readonly apiKey: string;
  private readonly appId: string;
  private readonly accessKey: string;
  private readonly baseUrl: string;
  private readonly resourceId: string;
  private readonly providerName: string;

  constructor() {
    const volcApiKey = process.env.VOLCENGINE_SPEECH_API_KEY || process.env.VOLCENGINE_API_KEY || '';
    const volcAppId = process.env.VOLCENGINE_SPEECH_APP_ID || process.env.VOLCENGINE_APP_ID || '';
    const volcAccessKey = process.env.VOLCENGINE_SPEECH_ACCESS_KEY || process.env.VOLCENGINE_ACCESS_KEY || '';
    const dashscopeApiKey = process.env.DASHSCOPE_API_KEY || '';

    if (volcApiKey || (volcAppId && volcAccessKey)) {
      this.apiKey = volcApiKey;
      this.appId = volcAppId;
      this.accessKey = volcAccessKey;
      this.baseUrl = process.env.VOLCENGINE_SPEECH_BASE_URL || 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash';
      this.resourceId = process.env.VOLCENGINE_SPEECH_RESOURCE_ID || 'volc.bigasr.auc_turbo';
      this.providerName = 'Volcengine Ark';
    } else {
      this.apiKey = dashscopeApiKey;
      this.appId = '';
      this.accessKey = '';
      this.baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
      this.resourceId = '';
      this.providerName = 'DashScope';
    }

    if (!this.apiKey && !(this.appId && this.accessKey)) {
      console.warn('ASRService: no speech provider API key is configured.');
    }
  }

  async convertToText(audioBuffer: Buffer): Promise<string> {
    const tempInput = path.join(os.tmpdir(), `input_${Date.now()}.wav`);

    try {
      await fs.writeFile(tempInput, audioBuffer);
      return await this.convertFileToText(tempInput);
    } finally {
      try {
        await fs.unlink(tempInput).catch(() => {});
      } catch (e) {}
    }
  }

  async convertFileToText(inputAudioPath: string, referenceText = '', debugAudioId?: string): Promise<string> {
    const tempOutput = path.join(os.tmpdir(), `output_${Date.now()}.wav`);

    try {
      console.log('[ASRService] Transcoding audio...');
      await audioPreprocessService.transcodeToPcmWav(inputAudioPath, tempOutput);

      if (debugAudioId) {
        await audioDebugService.saveFile(
          debugAudioId,
          'asr-input',
          tempOutput,
          'asr-input.wav',
        );
      }

      const transcript = this.providerName === 'Volcengine Ark'
        ? await this.transcribeWithVolcengine(tempOutput, referenceText)
        : await this.transcribeWithDashScope(tempOutput, referenceText);
      if (transcript) {
        return transcript;
      }

      throw new Error('Speech provider returned an empty transcript.');
    } catch (error: any) {
      console.error('[ASRService] Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });
      return 'ASR Service error. Please check server logs.';
    } finally {
      try {
        await fs.unlink(tempOutput).catch(() => {});
      } catch (error) {}
    }
  }

  private async transcribeWithVolcengine(audioPath: string, referenceText: string): Promise<string> {
    console.log('[ASRService] Uploading to Volcengine OpenSpeech...');
    const audioBuffer = await fs.readFile(audioPath);
    const languageHint = this.inferLanguageHint(referenceText);

    const response = await axios.post(this.baseUrl, {
      user: {
        uid: this.appId || 'EchoTutor',
      },
      audio: {
        data: audioBuffer.toString('base64'),
        ...(languageHint ? { language: languageHint } : {}),
      },
      request: {
        model_name: 'bigmodel',
        enable_itn: true,
        enable_punc: false,
        show_utterances: false,
        vad_segment: false,
      },
    }, {
      headers: this.buildVolcengineHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log('[ASRService] Volcengine transcription response received.');

    const statusCode = response.headers['x-api-status-code'];
    if (statusCode && String(statusCode) !== '20000000') {
      throw new Error(`Volcengine OpenSpeech error ${statusCode}: ${response.headers['x-api-message'] || 'unknown error'}`);
    }

    return typeof response.data?.result?.text === 'string' ? response.data.result.text.trim() : '';
  }

  private async transcribeWithDashScope(audioPath: string, referenceText: string): Promise<string> {
    console.log('[ASRService] Uploading to DashScope...');
    const audioBuffer = await fs.readFile(audioPath);
    const audioDataUri = `data:audio/wav;base64,${audioBuffer.toString('base64')}`;
    const languageHint = this.inferLanguageHint(referenceText);

    const response = await axios.post(this.baseUrl, {
      model: process.env.DASHSCOPE_ASR_MODEL || 'qwen3-asr-flash',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: {
                data: audioDataUri,
              },
            },
            {
              type: 'text',
              text: this.buildTranscriptionPrompt(languageHint),
            },
          ],
        },
      ],
      stream: false,
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log('[ASRService] DashScope transcription response received.');
    return this.extractTranscript(response.data?.choices?.[0]?.message?.content);
  }

  private buildVolcengineHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Api-Resource-Id': this.resourceId,
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Sequence': '-1',
    };

    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    if (this.appId) {
      headers['X-Api-App-Key'] = this.appId;
    }

    if (this.accessKey) {
      headers['X-Api-Access-Key'] = this.accessKey;
    }

    return headers;
  }

  private extractTranscript(content: unknown): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === 'string') {
            return item;
          }
          if (item && typeof item === 'object' && 'text' in item && typeof (item as { text?: unknown }).text === 'string') {
            return ((item as { text: string }).text);
          }
          return '';
        })
        .join('')
        .trim();
    }

    return '';
  }

  private inferLanguageHint(referenceText: string): 'en-US' | 'zh-CN' | '' {
    const text = referenceText.trim();
    if (!text) {
      return 'en-US';
    }

    const chineseMatches = text.match(/[\u4e00-\u9fff]/g) || [];
    const latinMatches = text.match(/[A-Za-z]/g) || [];

    if (chineseMatches.length > latinMatches.length * 1.5) {
      return 'zh-CN';
    }

    if (latinMatches.length > chineseMatches.length * 1.5) {
      return 'en-US';
    }

    return 'en-US';
  }

  private buildTranscriptionPrompt(languageHint: 'en-US' | 'zh-CN' | ''): string {
    if (languageHint === 'en-US') {
      return 'Transcribe the audio faithfully in English only. Do not translate, do not insert Chinese characters, and do not mix Chinese into English output. Return only the transcript text.';
    }

    if (languageHint === 'zh-CN') {
      return 'Transcribe the audio faithfully in Simplified Chinese only. Do not translate, do not insert English unless it is clearly spoken, and return only the transcript text.';
    }

    return 'Transcribe the audio faithfully in the language actually spoken. Do not translate. If the speech is entirely English, output English only; if it is entirely Chinese, output Simplified Chinese only. Return only the transcript text.';
  }
}
