import axios from 'axios';

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

  async evaluate(text: string): Promise<EvaluationResult> {
    if (!this.apiKey) {
      return this.getMockResult(text, 'API Key not configured.');
    }

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
                  text: `You are an expert English tutor. Evaluate the user's spoken English transcription.
              
              IMPORTANT: The input text is raw ASR output (lowercase, no punctuation).
              - DO NOT criticize missing punctuation, capitalization, or sentence segmentation.
              - Focus ONLY on vocabulary mistakes, wrong verb tenses, incorrect prepositions, or broken sentence structures.
              - If the text is unintelligible or seems to be random words, mention that the pronunciation might need improvement.
              
              Provide feedback in JSON format with the following keys. IMPORTANT: ONLY return the JSON object, do not include any other text or formatting:
              - score: (number 0-100)
              - grammarIssues: (array of strings, in Chinese. Ignore punctuation/casing issues.)
              - pronunciationFeedback: (array of strings, based on common issues for this transcription, in Chinese)
              - correction: (string, the natural/correct version of what they said, with proper punctuation and capitalization)
              
              Keep feedback concise and helpful.`
                }
              ]
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Transcription: "${text}"`
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
      pronunciationFeedback: ["AI evaluation unavailable."],
      correction: text
    };
  }
}