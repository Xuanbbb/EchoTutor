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

const TAXI_RIDE_MISSIONS: ScenarioMission[] = [
  {
    id: 'share_destination',
    title: 'Share your destination',
    description: 'Tell the driver where you are going or show the address.',
  },
  {
    id: 'confirm_route_or_time',
    title: 'Confirm the route or travel time',
    description: 'Ask about the route, traffic, or how long the ride will take.',
  },
  {
    id: 'state_preference',
    title: 'State a ride preference',
    description: 'Mention AC, music, speed, luggage, or another ride preference.',
  },
  {
    id: 'close_the_ride',
    title: 'Close the ride politely',
    description: 'Confirm arrival, ask about payment, or thank the driver.',
  },
];

const TAXI_DRIVER_MISSIONS: ScenarioMission[] = [
  {
    id: 'welcome_passenger',
    title: 'Welcome the passenger',
    description: 'Greet the passenger and ask where they are headed.',
  },
  {
    id: 'confirm_destination_or_route',
    title: 'Confirm destination or route',
    description: 'Repeat the destination and discuss traffic, route, or travel time.',
  },
  {
    id: 'respond_to_preference',
    title: 'Respond to a ride preference',
    description: 'Handle luggage, air conditioning, music, or another passenger request.',
  },
  {
    id: 'finish_trip_politely',
    title: 'Finish the trip',
    description: 'Announce arrival, confirm payment, or close the ride politely.',
  },
];

const COFFEE_SHOP_MISSIONS: ScenarioMission[] = [
  {
    id: 'start_order',
    title: 'Start the order',
    description: 'Say what you want to order or ask for the menu/recommendation.',
  },
  {
    id: 'choose_size_or_item_details',
    title: 'Choose size or item details',
    description: 'Mention the size, type of drink, or a food item.',
  },
  {
    id: 'add_customization',
    title: 'Add a customization',
    description: 'Ask for less sugar, oat milk, ice level, takeaway, or another change.',
  },
  {
    id: 'pay_and_close',
    title: 'Pay and close',
    description: 'Confirm the total, payment method, or close the order politely.',
  },
];

const BARISTA_MISSIONS: ScenarioMission[] = [
  {
    id: 'greet_customer',
    title: 'Greet the customer',
    description: 'Welcome the customer and ask what they would like.',
  },
  {
    id: 'confirm_drink_details',
    title: 'Confirm drink details',
    description: 'Ask about size, drink type, or food choice.',
  },
  {
    id: 'handle_customization',
    title: 'Handle customization',
    description: 'Ask or respond about milk, sugar, ice, takeaway, or other preferences.',
  },
  {
    id: 'take_payment_and_close',
    title: 'Take payment and close',
    description: 'Share the total, confirm payment, and finish politely.',
  },
];

const CLINIC_VISIT_MISSIONS: ScenarioMission[] = [
  {
    id: 'state_reason_for_visit',
    title: 'State the reason for your visit',
    description: 'Explain your main symptom or say you need to see a doctor.',
  },
  {
    id: 'describe_symptoms',
    title: 'Describe your symptoms',
    description: 'Say what hurts, how long you have felt this way, or how serious it is.',
  },
  {
    id: 'answer_basic_questions',
    title: 'Answer basic questions',
    description: 'Talk about fever, medicine, allergies, or other basic health details.',
  },
  {
    id: 'confirm_next_step',
    title: 'Confirm the next step',
    description: 'Ask where to wait, what to do next, or close politely.',
  },
];

const CLINIC_RECEPTIONIST_MISSIONS: ScenarioMission[] = [
  {
    id: 'welcome_patient',
    title: 'Welcome the patient',
    description: 'Greet the patient and ask how you can help.',
  },
  {
    id: 'ask_about_symptoms',
    title: 'Ask about symptoms',
    description: 'Ask what the problem is and how long it has lasted.',
  },
  {
    id: 'collect_basic_info',
    title: 'Collect basic information',
    description: 'Ask about fever, medicine, allergies, or an appointment.',
  },
  {
    id: 'give_next_steps',
    title: 'Give next steps',
    description: 'Tell the patient where to wait or what will happen next.',
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
  {
    id: 'taxi-ride',
    title: 'Taxi Ride',
    description: 'Practice taking a taxi, giving directions, and discussing ride details.',
    role: 'You are the passenger. AI is the taxi driver.',
    goal: 'Share your destination, discuss one ride detail, and finish the trip naturally.',
    difficulty: 'beginner',
    openingLine: 'Hello. Where would you like to go today?',
    keyPoints: ['destination', 'address', 'traffic', 'payment', 'arrival'],
    missions: TAXI_RIDE_MISSIONS,
    roleSetups: [
      {
        id: 'passenger',
        label: 'Be the passenger',
        userRole: 'taxi passenger',
        assistantRole: 'taxi driver',
        openingLine: 'Hello. Where would you like to go today?',
        goal: 'Share your destination, discuss one ride detail, and finish the trip naturally.',
        enableMissions: true,
        missions: TAXI_RIDE_MISSIONS,
      },
      {
        id: 'driver',
        label: 'Be the driver',
        userRole: 'taxi driver',
        assistantRole: 'taxi passenger',
        openingLine: 'Hi. Could you take me to 88 Garden Road, please?',
        goal: 'Confirm the destination, respond to one passenger request, and finish the ride politely.',
        enableMissions: true,
        missions: TAXI_DRIVER_MISSIONS,
      },
    ],
  },
  {
    id: 'coffee-shop-order',
    title: 'Coffee Shop Order',
    description: 'Practice ordering drinks, asking for customizations, and paying politely.',
    role: 'You are the customer. AI is the barista.',
    goal: 'Order a drink, add one customization, and complete the payment naturally.',
    difficulty: 'beginner',
    openingLine: 'Hi there. What can I get started for you today?',
    keyPoints: ['coffee', 'size', 'milk', 'sugar', 'takeaway'],
    missions: COFFEE_SHOP_MISSIONS,
    roleSetups: [
      {
        id: 'customer',
        label: 'Be the customer',
        userRole: 'coffee shop customer',
        assistantRole: 'barista',
        openingLine: 'Hi there. What can I get started for you today?',
        goal: 'Order a drink, add one customization, and complete the payment naturally.',
        enableMissions: true,
        missions: COFFEE_SHOP_MISSIONS,
      },
      {
        id: 'barista',
        label: 'Be the barista',
        userRole: 'barista',
        assistantRole: 'coffee shop customer',
        openingLine: 'Hi. Can I get a latte, please?',
        goal: 'Take the order, confirm the details, and close the payment politely.',
        enableMissions: true,
        missions: BARISTA_MISSIONS,
      },
    ],
  },
  {
    id: 'clinic-visit',
    title: 'Clinic Visit',
    description: 'Practice explaining symptoms and checking what to do at a clinic.',
    role: 'You are the patient. AI is the clinic receptionist.',
    goal: 'Explain your symptoms, answer a few questions, and confirm the next step.',
    difficulty: 'intermediate',
    openingLine: 'Good afternoon. How can I help you today?',
    keyPoints: ['symptoms', 'appointment', 'fever', 'medicine', 'waiting room'],
    missions: CLINIC_VISIT_MISSIONS,
    roleSetups: [
      {
        id: 'patient',
        label: 'Be the patient',
        userRole: 'clinic patient',
        assistantRole: 'clinic receptionist',
        openingLine: 'Good afternoon. How can I help you today?',
        goal: 'Explain your symptoms, answer a few questions, and confirm the next step.',
        enableMissions: true,
        missions: CLINIC_VISIT_MISSIONS,
      },
      {
        id: 'receptionist',
        label: 'Be the receptionist',
        userRole: 'clinic receptionist',
        assistantRole: 'clinic patient',
        openingLine: 'Hi. I have had a sore throat and a fever since yesterday, and I need to see a doctor.',
        goal: 'Ask about the symptoms, collect basic information, and give a clear next step.',
        enableMissions: true,
        missions: CLINIC_RECEPTIONIST_MISSIONS,
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

    if (session.scenario.id === 'taxi-ride' && session.roleSetup.id === 'passenger') {
      return this.evaluateTaxiPassengerMissions(session, userText);
    }

    if (session.scenario.id === 'taxi-ride' && session.roleSetup.id === 'driver') {
      return this.evaluateTaxiDriverMissions(session, userText);
    }

    if (session.scenario.id === 'coffee-shop-order' && session.roleSetup.id === 'customer') {
      return this.evaluateCoffeeShopCustomerMissions(session, userText);
    }

    if (session.scenario.id === 'coffee-shop-order' && session.roleSetup.id === 'barista') {
      return this.evaluateBaristaMissions(session, userText);
    }

    if (session.scenario.id === 'clinic-visit' && session.roleSetup.id === 'patient') {
      return this.evaluateClinicPatientMissions(session, userText);
    }

    if (session.scenario.id === 'clinic-visit' && session.roleSetup.id === 'receptionist') {
      return this.evaluateClinicReceptionistMissions(session, userText);
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

  private evaluateTaxiPassengerMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('share_destination', /\b(go to|take me to|heading to|address|street|road|avenue|airport|hotel|station|mall)\b/.test(normalized));
    tryComplete('confirm_route_or_time', /\b(route|way|traffic|long|far|minutes|how long|fastest)\b/.test(normalized) || normalized.includes('?'));
    tryComplete('state_preference', /\b(ac|air conditioning|music|window|luggage|bags|slowly|faster|quiet|stop here)\b/.test(normalized));
    tryComplete('close_the_ride', /\b(here is fine|we are here|arrived|payment|cash|card|thank you|thanks|keep the change)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
    return justCompleted;
  }

  private evaluateTaxiDriverMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('welcome_passenger', /\b(hello|hi|good morning|good afternoon|where would you like to go|hop in)\b/.test(normalized));
    tryComplete('confirm_destination_or_route', /\b(address|road|street|avenue|airport|station|hotel|traffic|route|minutes|take)\b/.test(normalized));
    tryComplete('respond_to_preference', /\b(ac|air conditioning|music|luggage|bags|quiet|window|sure|no problem)\b/.test(normalized));
    tryComplete('finish_trip_politely', /\b(we are here|arrived|payment|cash|card|thank you|have a nice day|take care)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
    return justCompleted;
  }

  private evaluateCoffeeShopCustomerMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('start_order', /\b(i('| a)?d like|can i get|may i have|menu|recommend|coffee|latte|tea|espresso|cappuccino)\b/.test(normalized));
    tryComplete('choose_size_or_item_details', /\b(small|medium|large|hot|iced|latte|americano|mocha|sandwich|muffin|croissant)\b/.test(normalized));
    tryComplete('add_customization', /\b(oat milk|soy milk|almond milk|less sugar|no sugar|extra shot|ice|no ice|takeaway|to go|for here)\b/.test(normalized));
    tryComplete('pay_and_close', /\b(card|cash|pay|total|that.?s all|thank you|thanks)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
    return justCompleted;
  }

  private evaluateBaristaMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('greet_customer', /\b(hello|hi|welcome|what can i get|what would you like)\b/.test(normalized));
    tryComplete('confirm_drink_details', /\b(size|small|medium|large|hot|iced|latte|americano|tea|anything to eat)\b/.test(normalized));
    tryComplete('handle_customization', /\b(milk|sugar|ice|oat|soy|almond|for here|to go|takeaway|extra shot)\b/.test(normalized));
    tryComplete('take_payment_and_close', /\b(total|that will be|cash|card|ready soon|thank you|have a nice day)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
    return justCompleted;
  }

  private evaluateClinicPatientMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('state_reason_for_visit', /\b(see a doctor|not feeling well|sick|appointment|cough|fever|headache|sore throat|stomachache|pain)\b/.test(normalized));
    tryComplete('describe_symptoms', /\b(since|for two days|for a day|temperature|hurts|pain|cough|fever|runny nose|dizzy|vomit|symptom)\b/.test(normalized));
    tryComplete('answer_basic_questions', /\b(allergy|allergies|medicine|medication|ibuprofen|paracetamol|no medicine|no allergies)\b/.test(normalized));
    tryComplete('confirm_next_step', /\b(where should i wait|what should i do next|okay|ok|thank you|thanks|understand)\b/.test(normalized) || normalized.includes('?'));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
    return justCompleted;
  }

  private evaluateClinicReceptionistMissions(session: ScenarioSession, userText: string): string[] {
    const normalized = userText.toLowerCase();
    const justCompleted: string[] = [];

    const tryComplete = (missionId: string, condition: boolean) => {
      if (!condition || session.completedMissionIds.includes(missionId)) {
        return;
      }
      session.completedMissionIds.push(missionId);
      justCompleted.push(missionId);
    };

    tryComplete('welcome_patient', /\b(hello|hi|good morning|good afternoon|how can i help)\b/.test(normalized));
    tryComplete('ask_about_symptoms', /\b(what seems to be the problem|what happened|how long|symptoms|fever|pain|cough)\b/.test(normalized));
    tryComplete('collect_basic_info', /\b(allergies|medicine|medication|appointment|insurance|id|temperature)\b/.test(normalized));
    tryComplete('give_next_steps', /\b(please wait|take a seat|fill out|the doctor will see you|thank you|next)\b/.test(normalized));

    session.currentMissionId = this.getActiveMissions(session).find((mission) => !session.completedMissionIds.includes(mission.id))?.id || null;
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
    if (session.scenario.id === 'hotel-checkin' && session.roleSetup.id === 'receptionist') {
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

    if (session.scenario.id === 'taxi-ride') {
      if (session.roleSetup.id === 'driver') {
        if (turn === 1) return 'Sure, I can take you there. Would you like the fastest route or the cheaper route?';
        if (turn === 2) return 'No problem. I can turn on the AC and put your bag in the back.';
        return 'We have arrived. You can pay by cash or card. Have a nice day.';
      }
      if (turn === 1) return 'No problem. Please get in. Could you share the address with me?';
      if (turn === 2) return 'It should take about twenty minutes because of traffic. Do you have any preference for the route?';
      return 'We are here now. You can pay by card if you like.';
    }

    if (session.scenario.id === 'coffee-shop-order') {
      if (session.roleSetup.id === 'barista') {
        if (turn === 1) return 'Of course. What size would you like, and would you like it hot or iced?';
        if (turn === 2) return 'No problem. We can make that with oat milk and less sugar.';
        return 'That will be ready soon. The total is six dollars. Thank you.';
      }
      if (turn === 1) return 'Sure. What size would you like for your drink?';
      if (turn === 2) return 'We can do that. Would you like regular milk, oat milk, or soy milk?';
      return 'Your total is ready whenever you are. It will be ready in a few minutes.';
    }

    if (session.scenario.id === 'clinic-visit') {
      if (session.roleSetup.id === 'receptionist') {
        if (turn === 1) return 'I am sorry to hear that. Could you tell me what symptoms you have and how long you have had them?';
        if (turn === 2) return 'Thank you. Do you have a fever, and are you taking any medicine right now?';
        return 'Please take a seat in the waiting area. The doctor will call you soon.';
      }
      if (turn === 1) return 'Of course. Could you tell me what symptoms you have today?';
      if (turn === 2) return 'I see. Are you taking any medicine, and do you have any allergies?';
      return 'Thank you. Please wait over there, and the doctor will see you shortly.';
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
