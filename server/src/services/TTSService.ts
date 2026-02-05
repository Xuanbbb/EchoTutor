import axios from 'axios';

export class TTSService {
  private apiKey: string;
  private readonly baseUrl: string = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('TTSService: DASHSCOPE_API_KEY is missing.');
    }
  }

  async generateAudio(text: string): Promise<Buffer> {
    if (!this.apiKey) {
      console.error('TTSService: API Key is not configured.');
      return Buffer.from("Error: TTS API Key missing");
    }

    try {
      // Call DashScope TTS API using HTTP request
      console.log('[TTSService] Calling DashScope TTS API...');
      const response = await axios.post(
        this.baseUrl,
        {
          model: "qwen3-tts-flash",
          input: {
            text: text
          },
          parameters: {
            voice: "longxiaochun",
            format: "mp3",
            sample_rate: 24000
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'json'
        }
      );

      console.log('[TTSService] Response received. Status:', response.status);
      console.log('[TTSService] Response data structure:', JSON.stringify(response.data, null, 2));

      // Parse response and extract audio data
      // DashScope TTS API returns audio in output.audio.url field
      if (response.data && response.data.output && response.data.output.audio) {
        const audio = response.data.output.audio;

        // Check for audio URL (the actual audio file location)
        if (audio.url) {
          console.log('[TTSService] Downloading audio from URL:', audio.url);
          const audioResponse = await axios.get(audio.url, {
            responseType: 'arraybuffer'
          });
          console.log('[TTSService] Audio downloaded successfully. Size:', audioResponse.data.byteLength, 'bytes');
          return Buffer.from(audioResponse.data);
        }

        // Check for direct base64 data (if data field is populated)
        if (audio.data && typeof audio.data === 'string' && audio.data.length > 0) {
          console.log('[TTSService] Processing base64 audio data');
          return Buffer.from(audio.data, 'base64');
        }

        console.error('[TTSService] Audio object exists but no valid url or data field');
      }

      console.error('[TTSService] Unexpected response structure from DashScope TTS.');
      console.error('[TTSService] Full response:', JSON.stringify(response.data, null, 2));
      return Buffer.from("Error: Failed to generate audio. Unexpected response.");

    } catch (error: any) {
      console.error('[TTSService] Error generating audio from DashScope:');
      console.error('[TTSService] Error message:', error.message);
      if (error.response) {
        console.error('[TTSService] Error response data:', error.response.data);
        console.error('[TTSService] Error response status:', error.response.status);
      }
      return Buffer.from("Error: Failed to generate audio from TTS service.");
    }
  }
}
