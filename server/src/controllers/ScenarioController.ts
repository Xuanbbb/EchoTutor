import { Request, Response } from 'express';
import { AssessmentOrchestrator } from '../services/assessment/AssessmentOrchestrator';
import { LLMService } from '../services/LLMService';
import {
  ScenarioConversationService,
  ScenarioMissionProgressState,
} from '../services/scenario/ScenarioConversationService';

const scenarioService = new ScenarioConversationService();
const assessmentOrchestrator = new AssessmentOrchestrator();
const llmService = new LLMService();

export const listScenarios = async (_req: Request, res: Response) => {
  res.json({
    scenarios: scenarioService.listScenarios(),
  });
};

export const startScenarioConversation = async (req: Request, res: Response) => {
  try {
    const { scenarioId, roleSetupId } = req.body as { scenarioId?: string; roleSetupId?: string };
    if (!scenarioId) {
      return res.status(400).json({ error: 'scenarioId is required.' });
    }

    const result = scenarioService.startSession(scenarioId, roleSetupId);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to start scenario conversation.',
    });
  }
};

export const replyScenarioConversation = async (req: Request, res: Response) => {
  try {
    const bodySessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : undefined;
    const querySessionId = typeof req.query?.sessionId === 'string' ? req.query.sessionId : undefined;
    const headerSessionId = typeof req.headers['x-session-id'] === 'string' ? req.headers['x-session-id'] : undefined;
    const sessionId = bodySessionId || querySessionId || headerSessionId;
    const scenarioId = typeof req.body?.scenarioId === 'string' ? req.body.scenarioId : undefined;
    const roleSetupId = typeof req.body?.roleSetupId === 'string' ? req.body.roleSetupId : undefined;
    const serializedMessages = typeof req.body?.messages === 'string' ? req.body.messages : undefined;
    const serializedMissionProgress = typeof req.body?.missionProgress === 'string' ? req.body.missionProgress : undefined;

    if (!sessionId) {
      return res.status(400).json({
        error: 'sessionId is required.',
        detail: 'No conversation session id was received with the audio reply.',
      });
    }
    if (!req.file) {
      return res.status(400).json({
        error: 'Audio file is required.',
        detail: 'The scenario reply request did not include an audio file.',
      });
    }

    try {
      scenarioService.getSession(sessionId);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'Conversation session not found.' || !scenarioId) {
        throw error;
      }

      const messages = parseJsonField(serializedMessages, []);
      const missionProgress = parseJsonField<ScenarioMissionProgressState | undefined>(serializedMissionProgress, undefined);
      scenarioService.restoreSession(sessionId, scenarioId, roleSetupId, messages, missionProgress);
    }

    const assessment = await assessmentOrchestrator.assessAudio(req.file.buffer, '');
    const evaluation = await llmService.evaluate(assessment);
    const conversation = await scenarioService.reply(sessionId, assessment.transcription);

    return res.json({
      sessionId,
      transcription: assessment.transcription,
      analysis: {
        pronunciationScore: assessment.scores.pronunciation,
        prosodyScore: assessment.scores.prosody,
        confidenceScore: assessment.scores.confidence,
        summary: assessment.learnerSafeSummary,
      },
      feedback: {
        pronunciationFeedback: evaluation.pronunciationFeedback,
        grammarIssues: evaluation.grammarIssues,
        correction: evaluation.correction,
      },
      assistantReply: conversation.assistantReply,
      completed: conversation.completed,
      missionProgress: conversation.missionProgress,
    });
  } catch (error) {
    console.error('[ScenarioController] Failed to continue scenario conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to continue scenario conversation.',
      detail: 'The backend could not finish processing this scenario reply.',
    });
  }
};

const parseJsonField = <T>(value: string | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};
