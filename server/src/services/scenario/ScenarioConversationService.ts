import axios from 'axios';
import crypto from 'crypto';

export interface ScenarioMission {
  id: string;
  title: string;
  description: string;
}

export interface ScenarioRoleSetup {
  id: string;
  label: string;
  userRole: string;
  assistantRole: string;
  openingLine: string;
  goal: string;
  enableMissions?: boolean;
  missions?: ScenarioMission[];
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  role: string;
  goal: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  openingLine: string;
  keyPoints: string[];
  missions: ScenarioMission[];
  roleSetups: ScenarioRoleSetup[];
}

type ConversationRole = 'assistant' | 'user';

interface ConversationMessage {
  role: ConversationRole;
  text: string;
}

interface ScenarioSession {
  id: string;
  scenario: ScenarioDefinition;
  roleSetup: ScenarioRoleSetup;
  messages: ConversationMessage[];
  completedMissionIds: string[];
  currentMissionId: string | null;
}

type MissionStatus = 'pending' | 'in_progress' | 'completed';

export interface ScenarioMissionProgressState {
  currentMissionId: string | null;
  completedMissionIds: string[];
}

export interface ScenarioReplyResult {
  assistantReply: string;
  completed: boolean;
  missionProgress: {
    currentMissionId: string | null;
    completedMissionIds: string[];
    justCompletedMissionIds: string[];
    missions: Array<ScenarioMission & { status: MissionStatus }>;
  };
}

const HOTEL_MISSIONS: ScenarioMission[] = [
  {
    id: 'state_checkin_purpose',
    title: 'State your purpose',
    description: 'Say that you want to check in or that you have a reservation.',
  },
  {
    id: 'provide_booking_info',
    title: 'Provide booking info',
    description: 'Give your name, passport, or booking details.',
  },
  {
    id: 'confirm_room_details',
    title: 'Confirm room details',
    description: 'Talk about your room, number of nights, bed type, or booking details.',
  },
  {
    id: 'ask_extra_question',
    title: 'Ask an extra question',
    description: 'Ask about breakfast, Wi-Fi, check-out time, or another hotel detail.',
  },
];

const RESTAURANT_MISSIONS: ScenarioMission[] = [
  {
    id: 'ask_for_time_or_menu',
    title: 'Respond to the opening',
    description: 'Say you are ready to order, need more time, or ask for the menu/recommendation.',
  },
  {
    id: 'order_food',
    title: 'Order a dish',
    description: 'Choose and order at least one main dish or food item.',
  },
  {
    id: 'add_drink_or_preference',
    title: 'Add a drink or preference',
    description: 'Add a drink, side, or a preference such as spicy level or no ice.',
  },
  {
    id: 'ask_followup_or_finish',
    title: 'Ask a follow-up or finish politely',
    description: 'Ask one follow-up question or close the order politely.',
  },
];

const HOTEL_RECEPTIONIST_MISSIONS: ScenarioMission[] = [
  {
    id: 'greet_guest',
    title: 'Greet the guest',
    description: 'Welcome the guest and acknowledge the check-in request politely.',
  },
  {
    id: 'ask_booking_details',
    title: 'Ask for booking details',
    description: 'Ask for the guest name, passport, or reservation details.',
  },
  {
    id: 'confirm_stay_details',
    title: 'Confirm stay details',
    description: 'Ask about nights, room type, or confirm the booking information.',
  },
  {
    id: 'answer_extra_question_or_close',
    title: 'Answer and close',
    description: 'Answer a hotel question or finish the check-in clearly and politely.',
  },
];

const RESTAURANT_WAITER_MISSIONS: ScenarioMission[] = [
  {
    id: 'welcome_customer',
    title: 'Welcome the customer',
    description: 'Greet the customer and offer the menu or ask if they are ready.',
  },
  {
    id: 'guide_food_choice',
    title: 'Guide the food choice',
    description: 'Recommend a dish or confirm what the customer wants to eat.',
  },
  {
    id: 'confirm_drink_or_preference',
    title: 'Confirm drink or preference',
    description: 'Ask about drinks, sides, or preferences such as spicy level.',
  },
  {
    id: 'close_order_politely',
    title: 'Close the order',
    description: 'Summarize the order or close the conversation politely.',
  },
];

const AIRPORT_AGENT_MISSIONS: ScenarioMission[] = [
  {
    id: 'greet_passenger',
    title: 'Greet the passenger',
    description: 'Welcome the passenger and ask how you can help.',
  },
  {
    id: 'collect_documents',
    title: 'Collect documents',
    description: 'Ask for the passport, ticket, or booking details.',
  },
  {
    id: 'check_baggage_and_seat',
    title: 'Check baggage and seat',
    description: 'Ask about baggage and confirm a seat or flight preference.',
  },
  {
    id: 'share_final_details',
    title: 'Share final details',
    description: 'Give boarding or gate details and close politely.',
  },
];

const AIRPORT_MISSIONS: ScenarioMission[] = [
  {
    id: 'provide_documents',
    title: 'Provide travel documents',
    description: 'Mention your passport, ticket, booking, or destination.',
  },
  {
    id: 'confirm_baggage',
    title: 'Confirm baggage details',
    description: 'Say whether you have checked baggage, carry-on, or the number of bags.',
  },
  {
    id: 'state_seat_or_flight_preference',
    title: 'State a seat or flight preference',
    description: 'Ask for or confirm a seat, boarding gate, boarding time, or another flight detail.',
  },
  {
    id: 'close_checkin',
    title: 'Finish check-in clearly',
    description: 'Confirm understanding, thank the agent, or close the check-in politely.',
  },
];

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
    missions: HOTEL_MISSIONS,
    roleSetups: [
      {
        id: 'guest',
        label: 'Be the guest',
        userRole: 'hotel guest',
        assistantRole: 'hotel receptionist',
        openingLine: 'Good evening. Welcome to Riverside Hotel. How can I help you today?',
        goal: 'Finish check-in, confirm your room, and ask about breakfast or check-out time.',
        enableMissions: true,
        missions: HOTEL_MISSIONS,
      },
      {
        id: 'receptionist',
        label: 'Be the receptionist',
        userRole: 'hotel receptionist',
        assistantRole: 'hotel guest',
        openingLine: 'Hi, I have a reservation under Taylor Chen. I would like to check in, please.',
        goal: 'Help the guest check in, confirm the booking, and answer one hotel question clearly.',
        enableMissions: true,
        missions: HOTEL_RECEPTIONIST_MISSIONS,
      },
    ],
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
    missions: RESTAURANT_MISSIONS,
    roleSetups: [
      {
        id: 'customer',
        label: 'Be the customer',
        userRole: 'restaurant customer',
        assistantRole: 'waiter',
        openingLine: 'Hello. Welcome in. Are you ready to order, or would you like a few more minutes?',
        goal: 'Order a meal, ask one follow-up question, and finish the order naturally.',
        enableMissions: true,
        missions: RESTAURANT_MISSIONS,
      },
      {
        id: 'waiter',
        label: 'Be the waiter',
        userRole: 'waiter',
        assistantRole: 'restaurant customer',
        openingLine: 'Hi. Could I see the menu, please? I am not ready to order yet.',
        goal: 'Help the customer choose food, answer one question, and close the order politely.',
        enableMissions: true,
        missions: RESTAURANT_WAITER_MISSIONS,
      },
    ],
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
    missions: AIRPORT_MISSIONS,
    roleSetups: [
      {
        id: 'passenger',
        label: 'Be the passenger',
        userRole: 'airline passenger',
        assistantRole: 'airline check-in agent',
        openingLine: 'Good morning. May I see your passport and ticket, please?',
        goal: 'Complete check-in, confirm baggage, and ask about boarding time or gate information.',
        enableMissions: true,
        missions: AIRPORT_MISSIONS,
      },
      {
        id: 'agent',
        label: 'Be the agent',
        userRole: 'airline check-in agent',
        assistantRole: 'airline passenger',
        openingLine: 'Hello. I am flying to Singapore today and I need to check in.',
        goal: 'Guide the passenger through check-in, ask about baggage, and confirm seat or gate details.',
        enableMissions: true,
        missions: AIRPORT_AGENT_MISSIONS,
      },
    ],
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

  startSession(scenarioId: string, roleSetupId?: string) {
    const scenario = this.getScenario(scenarioId);
    const roleSetup = this.getRoleSetup(scenario, roleSetupId);
    const id = crypto.randomUUID();
    const session = this.createSession(id, scenario, roleSetup);
    this.sessions.set(id, session);

    return {
      sessionId: id,
      scenario: this.toClientScenario(scenario, roleSetup),
      roleSetupId: roleSetup.id,
      openingMessage: roleSetup.openingLine,
      missionProgress: this.buildMissionProgress(session, []),
    };
  }

  getSession(sessionId: string): ScenarioSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Conversation session not found.');
    }
    return session;
  }

  restoreSession(
    sessionId: string,
    scenarioId: string,
    roleSetupId: string | undefined,
    messages: ConversationMessage[] = [],
    missionProgress?: ScenarioMissionProgressState,
  ): ScenarioSession {
    const scenario = this.getScenario(scenarioId);
    const roleSetup = this.getRoleSetup(scenario, roleSetupId);
    const sanitizedMessages = messages
      .filter((message) => message && (message.role === 'assistant' || message.role === 'user'))
      .map((message) => ({
        role: message.role,
        text: typeof message.text === 'string' ? message.text : '',
      }))
      .filter((message) => message.text.trim().length > 0);

    const session = this.createSession(sessionId, scenario, roleSetup);
    session.messages = sanitizedMessages.length > 0
      ? sanitizedMessages
      : [{ role: 'assistant', text: roleSetup.openingLine }];
    session.completedMissionIds = roleSetup.enableMissions && Array.isArray(missionProgress?.completedMissionIds)
      ? missionProgress.completedMissionIds.filter((missionId) => this.getActiveMissionsForRole(roleSetup).some((mission) => mission.id === missionId))
      : [];
    session.currentMissionId = !roleSetup.enableMissions
      ? null
      : missionProgress?.currentMissionId && this.getActiveMissionsForRole(roleSetup).some((mission) => mission.id === missionProgress.currentMissionId)
      ? missionProgress.currentMissionId
      : this.getActiveMissionsForRole(roleSetup).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;

    this.sessions.set(sessionId, session);
    return session;
  }

  async reply(sessionId: string, userText: string): Promise<ScenarioReplyResult> {
    const session = this.getSession(sessionId);
    session.messages.push({ role: 'user', text: userText });

    const justCompletedMissionIds = this.evaluateMissions(session, userText);
    const assistantReply = await this.generateAssistantReply(session);
    session.messages.push({ role: 'assistant', text: assistantReply });

    return {
      assistantReply,
      completed: session.currentMissionId === null || session.messages.length >= 12,
      missionProgress: this.buildMissionProgress(session, justCompletedMissionIds),
    };
  }

  private evaluateMissions(session: ScenarioSession, userText: string): string[] {
    if (!session.roleSetup.enableMissions) {
      return [];
    }

    if (session.scenario.id === 'restaurant-order' && session.roleSetup.id === 'customer') {
      return this.evaluateRestaurantMissions(session, userText);
    }

    if (session.scenario.id === 'restaurant-order' && session.roleSetup.id === 'waiter') {
      return this.evaluateRestaurantWaiterMissions(session, userText);
    }

    if (session.scenario.id === 'airport-checkin' && session.roleSetup.id === 'passenger') {
      return this.evaluateAirportMissions(session, userText);
    }

    if (session.scenario.id === 'airport-checkin' && session.roleSetup.id === 'agent') {
      return this.evaluateAirportAgentMissions(session, userText);
    }

    if (session.scenario.id === 'hotel-checkin' && session.roleSetup.id === 'receptionist') {
      return this.evaluateHotelReceptionistMissions(session, userText);
    }

    if (session.scenario.id !== 'hotel-checkin') {
      return [];
    }

    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete(
      'state_checkin_purpose',
      /\b(check in|checking in|reservation|booked|booking)\b/.test(normalized),
    );

    tryComplete(
      'provide_booking_info',
      /\b(my name is|i'm|i am|passport|reservation number|booking number)\b/.test(normalized),
    );

    tryComplete(
      'confirm_room_details',
      /\b(one night|two nights|three nights|single room|double room|one bed|two beds|room|stay)\b/.test(normalized),
    );

    tryComplete(
      'ask_extra_question',
      normalized.includes('?') || /\b(breakfast|wifi|wi-fi|check-out|checkout|internet|gym|pool|time)\b/.test(normalized),
    );

    const nextPending = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id));
    session.currentMissionId = nextPending?.id || null;

    return justCompleted;
  }

  private evaluateHotelReceptionistMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('greet_guest', /\b(welcome|good evening|good morning|hello|hi|how can i help|certainly)\b/.test(normalized));
    tryComplete('ask_booking_details', /\b(name|passport|reservation|booking|may i have|may i see)\b/.test(normalized));
    tryComplete('confirm_stay_details', /\b(how many nights|nights|room type|single|double|bed|stay|confirm)\b/.test(normalized));
    tryComplete('answer_extra_question_or_close', /\b(breakfast|wifi|check-out|checkout|gym|pool|here is your key|enjoy your stay|thank you)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find(
      (mission) => !session.completedMissionIds.includes(mission.id),
    )?.id || null;

    return justCompleted;
  }

  private evaluateRestaurantMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete(
      'ask_for_time_or_menu',
      /\b(ready|not ready|more time|menu|recommend|recommendation|what do you suggest|what do you recommend)\b/.test(normalized),
    );

    tryComplete(
      'order_food',
      /\b(i('| a)?ll have|i want|i would like|can i get|i'd like|order)\b/.test(normalized) ||
      /\b(chicken|beef|pasta|fish|salad|burger|steak|rice|soup|pizza|noodles|sandwich)\b/.test(normalized),
    );

    tryComplete(
      'add_drink_or_preference',
      /\b(water|tea|coffee|juice|cola|coke|drink|wine|beer|no ice|less ice|spicy|mild|medium|without|extra)\b/.test(normalized),
    );

    tryComplete(
      'ask_followup_or_finish',
      normalized.includes('?') ||
      /\b(thank you|that's all|that will be all|for here|to go|take away|takeaway|how much|bill|check please)\b/.test(normalized),
    );

    session.currentMissionId = this.getActiveMissions(session).find(
      (mission) => !session.completedMissionIds.includes(mission.id),
    )?.id || null;

    return justCompleted;
  }

  private evaluateAirportMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete(
      'provide_documents',
      /\b(passport|ticket|boarding pass|booking|reservation|flight|going to|destination|i am flying to)\b/.test(normalized),
    );

    tryComplete(
      'confirm_baggage',
      /\b(bag|bags|baggage|luggage|carry-on|carry on|checked bag|check in bag|suitcase)\b/.test(normalized),
    );

    tryComplete(
      'state_seat_or_flight_preference',
      /\b(window|aisle|seat|boarding|gate|time|departure|boarding time|boarding gate|near the front)\b/.test(normalized),
    );

    tryComplete(
      'close_checkin',
      /\b(thank you|thanks|okay|ok|got it|understand|sounds good|have a nice day)\b/.test(normalized),
    );

    session.currentMissionId = this.getActiveMissions(session).find(
      (mission) => !session.completedMissionIds.includes(mission.id),
    )?.id || null;

    return justCompleted;
  }

  private evaluateRestaurantWaiterMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('welcome_customer', /\b(hello|hi|welcome|good evening|good afternoon|are you ready|menu)\b/.test(normalized));
    tryComplete('guide_food_choice', /\b(recommend|popular|special|would you like|what would you like|chicken|pasta|fish|burger|salad)\b/.test(normalized));
    tryComplete('confirm_drink_or_preference', /\b(drink|water|tea|coffee|juice|spicy|mild|no ice|extra|side)\b/.test(normalized));
    tryComplete('close_order_politely', /\b(great choice|i will place your order|anything else|that.?s all|thank you|right away)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find(
      (mission) => !session.completedMissionIds.includes(mission.id),
    )?.id || null;

    return justCompleted;
  }

  private evaluateAirportAgentMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('greet_passenger', /\b(hello|hi|good morning|good afternoon|how can i help|where are you flying)\b/.test(normalized));
    tryComplete('collect_documents', /\b(passport|ticket|booking|reservation|may i see)\b/.test(normalized));
    tryComplete('check_baggage_and_seat', /\b(baggage|bag|luggage|carry-on|window|aisle|seat)\b/.test(normalized));
    tryComplete('share_final_details', /\b(boarding|gate|starts at|departs at|all set|thank you|have a nice flight)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find(
      (mission) => !session.completedMissionIds.includes(mission.id),
    )?.id || null;

    return justCompleted;
  }

  private createSession(id: string, scenario: ScenarioDefinition, roleSetup: ScenarioRoleSetup): ScenarioSession {
    return {
      id,
      scenario,
      roleSetup,
      messages: [{ role: 'assistant', text: roleSetup.openingLine }],
      completedMissionIds: [],
      currentMissionId: roleSetup.enableMissions ? this.getActiveMissionsForRole(roleSetup)[0]?.id || null : null,
    };
  }

  private getScenario(scenarioId: string): ScenarioDefinition {
    const scenario = SCENARIOS.find((item) => item.id === scenarioId);
    if (!scenario) {
      throw new Error('Scenario not found.');
    }
    return scenario;
  }

  private buildMissionProgress(session: ScenarioSession, justCompletedMissionIds: string[]) {
    if (!session.roleSetup.enableMissions) {
      return {
        currentMissionId: null,
        completedMissionIds: [],
        justCompletedMissionIds: [],
        missions: [],
      };
    }

    const currentMissionId = session.currentMissionId;
    return {
      currentMissionId,
      completedMissionIds: [...session.completedMissionIds],
      justCompletedMissionIds,
      missions: this.getActiveMissions(session).map((mission) => ({
        ...mission,
        status: (session.completedMissionIds.includes(mission.id)
          ? 'completed'
          : currentMissionId === mission.id
            ? 'in_progress'
            : 'pending') as MissionStatus,
      })),
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
                  text: this.buildSystemPrompt(session),
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

  private buildSystemPrompt(session: ScenarioSession): string {
    const missionText = this.getActiveMissions(session).length > 0
      && session.roleSetup.enableMissions
      ? this.getActiveMissions(session).map((mission) => {
          const status = session.completedMissionIds.includes(mission.id) ? 'completed' : 'pending';
          return `- ${mission.title}: ${status}`;
        }).join('\n')
      : '- No structured missions for this scenario.';

    return `You are running a spoken-English roleplay exercise.

Scenario: ${session.scenario.title}
Role setup: The learner is the ${session.roleSetup.userRole}. You are the ${session.roleSetup.assistantRole}.
Goal: ${session.roleSetup.goal}
Key points: ${session.scenario.keyPoints.join(', ')}
Mission status:
${missionText}
Current mission: ${session.currentMissionId || 'conversation wrap-up'}

Rules:
- Stay in character.
- Never switch roles with the learner.
- Never speak as the learner or write the learner's next line for them.
- Keep each reply to 1-3 short sentences.
- Move the learner toward the current mission before switching topics.
- Sound natural, polite, and practical.
- Do not explain grammar rules or become a teacher in the roleplay reply.
- If the learner response is unclear, ask a short clarifying question instead of ending the conversation.`;
  }

  private getFallbackReply(session: ScenarioSession): string {
    if (session.roleSetup.id === 'receptionist') {
      const turn = session.messages.filter((message) => message.role === 'user').length;
      if (turn === 1) return 'Certainly. May I see your passport, and how many nights will you stay?';
      if (turn === 2) return 'Thank you. Your booking looks fine. Do you need breakfast information or check-out time as well?';
      return 'Everything is ready. Here is your key card. Have a pleasant stay.';
    }

    const mission = session.currentMissionId;

    if (session.scenario.id === 'hotel-checkin') {
      if (mission === 'state_checkin_purpose') {
        return 'Sure. Are you checking in today, or do you need help with a reservation?';
      }
      if (mission === 'provide_booking_info') {
        return 'Of course. May I have your name and passport, please?';
      }
      if (mission === 'confirm_room_details') {
        return 'Thank you. How many nights will you be staying, and what kind of room do you need?';
      }
      if (mission === 'ask_extra_question') {
        return 'Everything looks good. Do you want to ask about breakfast, Wi-Fi, or check-out time?';
      }
      return 'You are all set. Here is your room key. Enjoy your stay.';
    }

    const turn = session.messages.filter((message) => message.role === 'user').length;
    if (session.scenario.id === 'restaurant-order') {
      if (session.roleSetup.id === 'waiter') {
        if (turn === 1) return 'Of course. Here is the menu. Would you like a recommendation, or do you already have something in mind?';
        if (turn === 2) return 'Our pasta and grilled fish are popular today. Would you like a drink as well?';
        return 'Absolutely. I will put that order in for you right away.';
      }
      if (turn === 1) return 'Sure. Our grilled chicken and pasta are both popular. What would you like?';
      if (turn === 2) return 'Great choice. Would you like anything to drink with that?';
      return 'Perfect. I will place your order now.';
    }

    if (session.roleSetup.id === 'agent') {
      if (turn === 1) return 'Sure. May I see your passport, and are you checking any bags today?';
      if (turn === 2) return 'Thank you. Do you prefer an aisle seat or a window seat?';
      return 'All set. Your boarding gate will appear on the screen shortly.';
    }

    if (turn === 1) return 'Certainly. Do you have any bags to check today?';
    if (turn === 2) return 'Your seat is confirmed. Would you like an aisle seat or a window seat?';
    return 'Your check-in is complete. Boarding starts in about forty minutes.';
  }

  private getRoleSetup(scenario: ScenarioDefinition, roleSetupId?: string): ScenarioRoleSetup {
    return scenario.roleSetups.find((item) => item.id === roleSetupId) || scenario.roleSetups[0];
  }

  private toClientScenario(scenario: ScenarioDefinition, roleSetup: ScenarioRoleSetup): ScenarioDefinition {
    return {
      ...scenario,
      role: `You are the ${roleSetup.userRole}. AI is the ${roleSetup.assistantRole}.`,
      goal: roleSetup.goal,
      openingLine: roleSetup.openingLine,
      missions: roleSetup.missions || scenario.missions,
    };
  }

  private getActiveMissions(session: ScenarioSession): ScenarioMission[] {
    return this.getActiveMissionsForRole(session.roleSetup);
  }

  private getActiveMissionsForRole(roleSetup: ScenarioRoleSetup): ScenarioMission[] {
    return roleSetup.missions || [];
  }
}
