import axios from 'axios';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import FormData from 'form-data';

const execAsync = util.promisify(exec);

export class ASRService {
  private apiKey: string;
  // Aliyun DashScope OpenAI-compatible endpoint for Audio
  private baseUrl: string = 'https://dashscope.aliyuncs.com/compatible-mode/v1/audio/transcriptions';

  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('ASRService: DASHSCOPE_API_KEY is missing.');
    }
  }

  async convertToText(audioBuffer: Buffer): Promise<string> {
    const tempInput = path.join(os.tmpdir(), `input_${Date.now()}.wav`);
    const tempOutput = path.join(os.tmpdir(), `output_${Date.now()}.wav`);

    try {
      // 1. Save buffer to temp file
      await fs.writeFile(tempInput, audioBuffer);
      
      // 2. Transcode with FFmpeg (Force 16k Mono WAV)
      const ffmpegPath = 'C:\\ffmpeg-7.1.1-full_build\\bin\\ffmpeg.exe'; 
      // Safe command construction with quotes
      const cmd = `"${ffmpegPath}" -y -i "${tempInput}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempOutput}"`;
      
      console.log(`[ASRService] Transcoding audio...`);
      try {
          await execAsync(cmd);
      } catch (e) {
          console.warn('[ASRService] Specific FFmpeg path failed, trying global "ffmpeg"...');
          await execAsync(`ffmpeg -y -i "${tempInput}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempOutput}"`);
      }

      // 3. Call Aliyun SenseVoice via OpenAI Compatible API
      console.log(`[ASRService] Uploading to Aliyun SenseVoice (OpenAI Compatible)...`);
      
      const formData = new FormData();
      formData.append('file', createReadStream(tempOutput));
      formData.append('model', 'sensevoice-v1');
      formData.append('language', 'en'); 

      const response = await axios.post(this.baseUrl, formData, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      console.log('[ASRService] Transcription response received.');
      
      if (response.data && response.data.text) {
          return response.data.text;
      } else {
          throw new Error(`Invalid response: ${JSON.stringify(response.data)}`);
      }

    } catch (error: any) {
      console.error('[ASRService] Error:', error.response?.data || error.message);
      return "ASR Service error. Please check server logs.";
    } finally {
      // Cleanup
      try {
        await fs.unlink(tempInput).catch(() => {});
        await fs.unlink(tempOutput).catch(() => {});
      } catch (e) {}
    }
  }
}
