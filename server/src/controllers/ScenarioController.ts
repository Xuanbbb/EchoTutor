import { Request, Response } from 'express';
import { AssessmentOrchestrator } from '../services/assessment/AssessmentOrchestrator';
import { LLMService } from '../services/LLMService';
import { ScenarioConversationService } from '../services/scenario/ScenarioConversationService';

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
    const { scenarioId } = req.body as { scenarioId?: string };
    if (!scenarioId) {
      return res.status(400).json({ error: 'scenarioId is required.' });
    }

    const result = scenarioService.startSession(scenarioId);
    return res.json(result);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to start scenario conversation.',
    });
  }
};

export const replyScenarioConversation = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required.' });
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
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to continue scenario conversation.',
    });
  }
};
