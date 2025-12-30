import axios from 'axios';

export interface EvaluationResult {
  score: number;
  grammarIssues: string[];
  pronunciationFeedback: string;
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
          model: 'qwen-plus', // Or qwen-max, qwen-turbo
          messages: [
            {
              role: 'system',
              content: `You are an expert English tutor. Evaluate the user's spoken English transcription. 
              Provide feedback in JSON format with the following keys:
              - score: (number 0-100)
              - grammarIssues: (array of strings)
              - pronunciationFeedback: (string, based on common issues for this transcription)
              - correction: (string, the natural/correct version of what they said)
              
              Keep feedback concise and helpful. Return ONLY the JSON object.`
            },
            {
              role: 'user',
              content: `Transcription: "${text}"`
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
      console.error('Error calling Tongyi Qianwen API:', error.response?.data || error.message);
      return this.getMockResult(text, 'Error calling AI service.');
    }
  }

  private getMockResult(text: string, note: string): EvaluationResult {
    return {
      score: 0,
      grammarIssues: [note],
      pronunciationFeedback: "AI evaluation unavailable.",
      correction: text
    };
  }
}