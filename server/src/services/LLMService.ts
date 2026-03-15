import axios from 'axios';
import { PronunciationResult } from '../services/ScoringService';

export interface EvaluationResult {
  score: number;
  grammarIssues: string[];
  pronunciationFeedback: string[];
  correction: string;
}

export class LLMService {
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Warning: DASHSCOPE_API_KEY is not set in environment variables.');
    }
  }

  async evaluate(text: string, pronunciationResult?: PronunciationResult): Promise<EvaluationResult> {
    if (!this.apiKey) {
      return this.getMockResult(text, 'API Key not configured.');
    }

    const userPayload = {
      transcription: text,
      pronunciation_score: pronunciationResult?.pronunciation_score ?? 0,
      prosody_score: pronunciationResult?.prosody_score ?? 0,
      pronunciation_analysis: pronunciationResult?.detailed_feedback?.trim() || '',
    };

    const systemContentText = `You are an expert English tutor.

Your job is to produce the final learner-facing feedback based on structured upstream results.

Important rules:
- The transcription is raw ASR output. Do not criticize missing punctuation, capitalization, or sentence segmentation.
- Ignore obvious ASR noise unless it clearly reflects a real vocabulary or grammar problem.
- grammarIssues must focus only on true English issues such as tense, word choice, prepositions, and sentence structure.
- Do not perform a fresh pronunciation diagnosis from scratch. Reuse the provided pronunciation analysis.
- The output must be only one JSON object with no markdown and no extra text.

Return a JSON object with exactly these keys:
- score: integer 0-100. Use pronunciation_score as the primary basis. Adjust only slightly if the transcription shows obvious language problems.
- grammarIssues: array of Chinese strings. Each string should describe one specific grammar or expression problem. If none, return [].
- pronunciationFeedback: array of Chinese strings. Convert the provided pronunciation analysis into 1-3 concise learner-facing points. Do not invent unsupported issues.
- correction: string in English. Rewrite the intended sentence naturally with proper punctuation and capitalization. If the transcription is too broken, provide the most conservative repair possible.

Keep the feedback concise, concrete, and useful for a learner.`;

    try {
      const response = await axios.post(
        this.baseUrl,
        {
          model: 'qwen3-vl-32b-instruct',
          messages: [
            {
              role: 'system',
              content: [
                {
                  type: 'text',
                  text: systemContentText
                }
              ]
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(userPayload, null, 2)
                }
              ]
            }
          ],
          response_format: { type: 'json_object' }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      return JSON.parse(content) as EvaluationResult;
    } catch (error: any) {
      const errorMessage = error.message || '';
      const isProxyIssue = errorMessage.includes('198.18.') || errorMessage.includes('ETIMEDOUT');

      if (isProxyIssue) {
        console.error('\n[Network Error] Possible Proxy/VPN Issue Detected');
        console.error('The server is trying to connect to a Fake-IP (often used by Clash/VPNs) but failing.');
        console.error('Action: Please TURN OFF your VPN/Proxy or configure it to bypass "aliyuncs.com".\n');
      }

      console.error('Error calling Tongyi Qianwen API:', error.response?.data || errorMessage);
      return this.getMockResult(text, isProxyIssue ? 'Network Error: Check VPN/Proxy' : 'Error calling AI service.');
    }
  }

  private getMockResult(text: string, note: string): EvaluationResult {
    return {
      score: 0,
      grammarIssues: [note],
      pronunciationFeedback: ['AI evaluation unavailable.'],
      correction: text
    };
  }
}
