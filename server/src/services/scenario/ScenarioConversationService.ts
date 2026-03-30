import axios from 'axios';
import crypto from 'crypto';

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  role: string;
  goal: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  openingLine: string;
  keyPoints: string[];
}

type ConversationRole = 'assistant' | 'user';

interface ConversationMessage {
  role: ConversationRole;
  text: string;
}

interface ScenarioSession {
  id: string;
  scenario: ScenarioDefinition;
  messages: ConversationMessage[];
}

export interface ScenarioReplyResult {
  assistantReply: string;
  completed: boolean;
}

const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'hotel-checkin',
    title: 'Hotel Check-in',
    description: 'Practice checking into a hotel abroad and asking about your room details.',
    role: 'You are the guest. AI is the hotel receptionist.',
    goal: 'Finish check-in, confirm your room, and ask about breakfast or check-out time.',
    difficulty: 'beginner',
    openingLine: 'Good evening. Welcome to Riverside Hotel. How can I help you today?',
    keyPoints: ['check-in', 'reservation name', 'room type', 'breakfast', 'check-out time'],
  },
  {
    id: 'restaurant-order',
    title: 'Restaurant Ordering',
    description: 'Practice ordering food, asking for recommendations, and paying politely.',
    role: 'You are the customer. AI is the waiter.',
    goal: 'Order a meal, ask one follow-up question, and finish the order naturally.',
    difficulty: 'beginner',
    openingLine: 'Hello. Welcome in. Are you ready to order, or would you like a few more minutes?',
    keyPoints: ['order', 'recommendation', 'drink', 'bill'],
  },
  {
    id: 'airport-checkin',
    title: 'Airport Check-in',
    description: 'Practice speaking with airline staff before a flight.',
    role: 'You are the passenger. AI is the airline check-in agent.',
    goal: 'Complete check-in, confirm baggage, and ask about boarding time or gate information.',
    difficulty: 'intermediate',
    openingLine: 'Good morning. May I see your passport and ticket, please?',
    keyPoints: ['passport', 'luggage', 'boarding gate', 'seat request'],
  },
];

export class ScenarioConversationService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
  private readonly sessions = new Map<string, ScenarioSession>();

  constructor() {
    this.apiKey = process.env.DASHSCOPE_API_KEY || '';
  }

  listScenarios(): ScenarioDefinition[] {
    return SCENARIOS;
  }

  startSession(scenarioId: string) {
    const scenario = SCENARIOS.find((item) => item.id === scenarioId);
    if (!scenario) {
      throw new Error('Scenario not found.');
    }

    const id = crypto.randomUUID();
    const session: ScenarioSession = {
      id,
      scenario,
      messages: [{ role: 'assistant', text: scenario.openingLine }],
    };
    this.sessions.set(id, session);

    return {
      sessionId: id,
      scenario,
      openingMessage: scenario.openingLine,
    };
  }

  getSession(sessionId: string): ScenarioSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Conversation session not found.');
    }
    return session;
  }

  async reply(sessionId: string, userText: string): Promise<ScenarioReplyResult> {
    const session = this.getSession(sessionId);
    session.messages.push({ role: 'user', text: userText });

    const assistantReply = await this.generateAssistantReply(session);
    session.messages.push({ role: 'assistant', text: assistantReply });

    return {
      assistantReply,
      completed: session.messages.length >= 10,
    };
  }

  private async generateAssistantReply(session: ScenarioSession): Promise<string> {
    if (!this.apiKey) {
      return this.getFallbackReply(session);
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
                  text: this.buildSystemPrompt(session.scenario),
                },
              ],
            },
            ...session.messages.map((message) => ({
              role: message.role,
              content: [
                {
                  type: 'text',
                  text: message.text,
                },
              ],
            })),
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return content.trim();
      }
      if (Array.isArray(content)) {
        const text = content
          .map((item: { text?: string }) => item?.text || '')
          .join('')
          .trim();
        if (text) {
          return text;
        }
      }
    } catch (error) {
      console.warn('[ScenarioConversationService] LLM reply failed, using fallback.', error);
    }

    return this.getFallbackReply(session);
  }

  private buildSystemPrompt(scenario: ScenarioDefinition): string {
    return `You are running a spoken-English roleplay exercise.

Scenario: ${scenario.title}
Role setup: ${scenario.role}
Goal: ${scenario.goal}
Key points: ${scenario.keyPoints.join(', ')}

Rules:
- Stay in character.
- Keep each reply to 1-3 short sentences.
- Ask follow-up questions that move the scene forward.
- Sound natural, polite, and practical.
- Do not explain grammar rules or become a teacher in the roleplay reply.
- If the learner response is unclear, ask a short clarifying question instead of ending the conversation.`;
  }

  private getFallbackReply(session: ScenarioSession): string {
    const turn = session.messages.filter((message) => message.role === 'user').length;
    const scenarioId = session.scenario.id;

    if (scenarioId === 'hotel-checkin') {
      if (turn === 1) return 'Of course. May I have your name and passport, please?';
      if (turn === 2) return 'Thank you. I found your booking. Would you like one bed or two beds?';
      if (turn === 3) return 'Your room includes breakfast. Check-out is at 11 a.m. Is there anything else you need?';
      return 'You are all set. Here is your room key. Enjoy your stay.';
    }

    if (scenarioId === 'restaurant-order') {
      if (turn === 1) return 'Sure. Our grilled chicken and pasta are both popular. What would you like?';
      if (turn === 2) return 'Great choice. Would you like anything to drink with that?';
      return 'Perfect. I will place your order now.';
    }

    if (turn === 1) return 'Certainly. Do you have any bags to check today?';
    if (turn === 2) return 'Your seat is confirmed. Would you like an aisle seat or a window seat?';
    return 'Your check-in is complete. Boarding starts in about forty minutes.';
  }
}
