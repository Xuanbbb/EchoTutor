import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useReactMediaRecorder } from 'react-media-recorder';

interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  role: string;
  goal: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  openingLine: string;
  keyPoints: string[];
}

interface ConversationMessage {
  role: 'assistant' | 'user';
  text: string;
  caption?: string;
}

interface ScenarioConversationPanelProps {
  playTts: (text: string) => Promise<void>;
  playingAudio: boolean;
}

const API_BASE = 'http://localhost:3000/api';

export const ScenarioConversationPanel = ({
  playTts,
  playingAudio,
}: ScenarioConversationPanelProps) => {
  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } =
    useReactMediaRecorder({ audio: true });

  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioDefinition | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(true);
  const [startingSession, setStartingSession] = useState(false);
  const [replying, setReplying] = useState(false);
  const [turnFeedback, setTurnFeedback] = useState<{
    pronunciationFeedback: string[];
    grammarIssues: string[];
    correction: string;
    summary: string;
    pronunciationScore: number;
    prosodyScore: number;
  } | null>(null);

  useEffect(() => {
    const loadScenarios = async () => {
      try {
        const response = await axios.get<{ scenarios: ScenarioDefinition[] }>(`${API_BASE}/scenarios`);
        setScenarios(response.data.scenarios || []);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      } finally {
        setLoadingScenarios(false);
      }
    };

    void loadScenarios();
  }, []);

  const hasSession = Boolean(sessionId && selectedScenario);
  const currentAssistantLine = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant')?.text || '',
    [messages],
  );

  const handleStartScenario = async (scenario: ScenarioDefinition) => {
    setStartingSession(true);
    setTurnFeedback(null);
    clearBlobUrl();

    try {
      const response = await axios.post<{
        sessionId: string;
        scenario: ScenarioDefinition;
        openingMessage: string;
      }>(`${API_BASE}/scenarios/start`, { scenarioId: scenario.id });

      setSelectedScenario(response.data.scenario);
      setSessionId(response.data.sessionId);
      setMessages([
        {
          role: 'assistant',
          text: response.data.openingMessage,
          caption: 'Scene opens',
        },
      ]);
    } catch (error) {
      console.error('Failed to start scenario:', error);
      alert('Failed to start scenario conversation.');
    } finally {
      setStartingSession(false);
    }
  };

  const handleSubmitReply = async () => {
    if (!mediaBlobUrl || !sessionId) {
      return;
    }

    setReplying(true);
    try {
      const blob = await fetch(mediaBlobUrl).then((response) => response.blob());
      const formData = new FormData();
      formData.append('audio', blob, 'scenario-reply.wav');
      formData.append('sessionId', sessionId);

      const response = await axios.post<{
        transcription: string;
        assistantReply: string;
        analysis: {
          pronunciationScore: number;
          prosodyScore: number;
          confidenceScore: number;
          summary: string;
        };
        feedback: {
          pronunciationFeedback: string[];
          grammarIssues: string[];
          correction: string;
        };
      }>(`${API_BASE}/scenarios/reply`, formData);

      const { transcription, assistantReply, analysis, feedback } = response.data;

      setMessages((current) => [
        ...current,
        {
          role: 'user',
          text: transcription || '(No speech recognized)',
          caption: 'Your reply',
        },
        {
          role: 'assistant',
          text: assistantReply,
          caption: 'AI partner',
        },
      ]);
      setTurnFeedback({
        pronunciationFeedback: feedback.pronunciationFeedback || [],
        grammarIssues: feedback.grammarIssues || [],
        correction: feedback.correction || '',
        summary: analysis.summary || '',
        pronunciationScore: analysis.pronunciationScore || 0,
        prosodyScore: analysis.prosodyScore || 0,
      });
      clearBlobUrl();
    } catch (error) {
      console.error('Failed to continue scenario conversation:', error);
      alert('Failed to send your reply.');
    } finally {
      setReplying(false);
    }
  };

  const handleResetScenario = () => {
    setSelectedScenario(null);
    setSessionId('');
    setMessages([]);
    setTurnFeedback(null);
    clearBlobUrl();
  };

  if (loadingScenarios) {
    return (
      <div className="control-card control-card-wide">
        <h3>Scenario Conversation</h3>
        <p className="selected-file">Loading scenarios...</p>
      </div>
    );
  }

  return (
    <div className="scenario-layout">
      {!hasSession && (
        <div className="control-card control-card-wide">
          <h3>Scenario Conversation</h3>
          <p className="scenario-intro">
            Choose a real-life situation and practice open-ended spoken English with an AI partner.
          </p>
          <div className="scenario-grid">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                className="scenario-card"
                onClick={() => void handleStartScenario(scenario)}
                disabled={startingSession}
              >
                <span className={`scenario-difficulty ${scenario.difficulty}`}>{scenario.difficulty}</span>
                <strong>{scenario.title}</strong>
                <span>{scenario.description}</span>
                <span className="scenario-goal">Goal: {scenario.goal}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasSession && selectedScenario && (
        <>
          <div className="scenario-header-card">
            <div>
              <div className="eyebrow">Scenario Roleplay</div>
              <h3>{selectedScenario.title}</h3>
              <p className="scenario-meta">{selectedScenario.role}</p>
            </div>
            <div className="topbar-actions">
              <button className="btn-outline" onClick={handleResetScenario}>
                Change Scenario
              </button>
              <button
                className="btn-secondary"
                onClick={() => void playTts(currentAssistantLine)}
                disabled={!currentAssistantLine || playingAudio}
              >
                {playingAudio ? 'Playing...' : 'Play AI line'}
              </button>
            </div>
          </div>

          <div className="scenario-chat-shell">
            <div className="scenario-chat-panel">
              <div className="scenario-chat-stream">
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`chat-bubble-row ${message.role === 'assistant' ? 'assistant' : 'user'}`}
                  >
                    <div className={`chat-bubble ${message.role === 'assistant' ? 'assistant' : 'user'}`}>
                      {message.caption && <div className="chat-caption">{message.caption}</div>}
                      <div>{message.text}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="scenario-recorder">
                <div className="status-label scenario-status">
                  Recording status: {status}
                </div>
                <div className="button-group">
                  <button className="btn-primary" onClick={startRecording} disabled={status === 'recording' || replying}>
                    Start
                  </button>
                  <button className="btn-secondary" onClick={stopRecording} disabled={status !== 'recording'}>
                    Stop
                  </button>
                  <button className="btn-outline" onClick={clearBlobUrl} disabled={!mediaBlobUrl}>
                    Clear
                  </button>
                </div>
                {mediaBlobUrl && (
                  <div className="player-wrapper">
                    <audio src={mediaBlobUrl} controls className="audio-player" />
                    <button className="btn-accent" onClick={() => void handleSubmitReply()} disabled={replying}>
                      {replying ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="scenario-side-panel">
              <div className="scenario-side-card">
                <div className="comparison-title">Mission</div>
                <p className="scenario-goal-text">{selectedScenario.goal}</p>
                <div className="scenario-tags">
                  {selectedScenario.keyPoints.map((point) => (
                    <span key={point} className="scenario-tag">{point}</span>
                  ))}
                </div>
              </div>

              {turnFeedback && (
                <div className="scenario-side-card">
                  <div className="comparison-title">This Turn</div>
                  <div className="scenario-score-row">
                    <div className="scenario-score-pill">Pronunciation {turnFeedback.pronunciationScore}</div>
                    <div className="scenario-score-pill">Prosody {turnFeedback.prosodyScore}</div>
                  </div>
                  <p className="scenario-summary">{turnFeedback.summary}</p>
                  <ul className="feedback-list compact">
                    {turnFeedback.pronunciationFeedback.map((item, index) => <li key={`p-${index}`}>{item}</li>)}
                  </ul>
                  {turnFeedback.grammarIssues.length > 0 && (
                    <ul className="feedback-list compact">
                      {turnFeedback.grammarIssues.map((item, index) => <li key={`g-${index}`}>{item}</li>)}
                    </ul>
                  )}
                  {turnFeedback.correction && (
                    <div className="correction-box scenario-correction">{turnFeedback.correction}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ScenarioConversationPanel;
