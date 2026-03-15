import React, { useState } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import axios from 'axios';
import './AudioRecorder.css';

interface EvaluationResult {
  score: number;
  grammarIssues: string[];
  pronunciationFeedback: string[];
  correction: string;
}

interface ScoringResult {
  pronunciation_score: number;
  prosody_score: number;
  details?: string;
  detailed_feedback?: string;
  recognized_text: string;
  confidence_score?: number;
}

interface AnalysisResult {
  transcription: string;
  pronunciationScore: number;
  prosodyScore: number;
  confidenceScore: number;
  pronunciationAnalysis: string;
}

interface FeedbackResult {
  overallScore: number;
  grammarIssues: string[];
  pronunciationFeedback: string[];
  correction: string;
}

interface ProcessAudioResponse {
  analysis?: AnalysisResult;
  feedback?: FeedbackResult;
  status?: {
    success: boolean;
    message: string;
  };
  error?: {
    stage: string;
    detail: string;
  };
  transcription?: string;
  evaluation?: EvaluationResult;
  scoring?: ScoringResult;
}

interface DiffToken {
  text: string;
  type: 'match' | 'missing' | 'extra';
}

const splitIntoSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const normalizeForCompare = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const buildDiffTokens = (reference: string, actual: string): DiffToken[] => {
  const refTokens = normalizeForCompare(reference);
  const actualTokens = normalizeForCompare(actual);
  const maxLength = Math.max(refTokens.length, actualTokens.length);
  const diffTokens: DiffToken[] = [];

  for (let i = 0; i < maxLength; i += 1) {
    const refToken = refTokens[i];
    const actualToken = actualTokens[i];

    if (refToken && actualToken) {
      if (refToken === actualToken) {
        diffTokens.push({ text: actualToken, type: 'match' });
      } else {
        diffTokens.push({ text: refToken, type: 'missing' });
        diffTokens.push({ text: actualToken, type: 'extra' });
      }
      continue;
    }

    if (refToken) {
      diffTokens.push({ text: refToken, type: 'missing' });
    }

    if (actualToken) {
      diffTokens.push({ text: actualToken, type: 'extra' });
    }
  }

  return diffTokens;
};

const AudioRecorder = () => {
  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } =
    useReactMediaRecorder({ audio: true });

  const [transcription, setTranscription] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [scoring, setScoring] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [referenceText, setReferenceText] = useState('');
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(0);
  const [lastPracticedSentence, setLastPracticedSentence] = useState('');

  const sentences = splitIntoSentences(referenceText);
  const hasSentenceMode = sentences.length > 0;
  const currentSentence = hasSentenceMode ? sentences[Math.min(currentSentenceIndex, sentences.length - 1)] : '';
  const activePracticeText = currentSentence || referenceText.trim();
  const comparisonTokens = lastPracticedSentence
    ? buildDiffTokens(lastPracticedSentence, transcription)
    : [];

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleReferenceTextChange = (value: string) => {
    setReferenceText(value);
    setCurrentSentenceIndex(0);
    setLastPracticedSentence('');
  };

  const processAudioData = async (audioData: Blob | File, fileName: string) => {
    setLoading(true);
    setEvaluation(null);
    setScoring(null);
    setTranscription('');

    const submittedReferenceText = activePracticeText;
    setLastPracticedSentence(submittedReferenceText);

    try {
      const formData = new FormData();
      formData.append('audio', audioData, fileName);
      if (submittedReferenceText) {
        formData.append('referenceText', submittedReferenceText);
      }

      const response = await axios.post<ProcessAudioResponse>('http://localhost:3000/api/process-audio', formData);
      const data = response.data;

      const analysis = data.analysis;
      const feedback = data.feedback;

      setTranscription(analysis?.transcription || data.transcription || '');

      if (feedback) {
        setEvaluation({
          score: feedback.overallScore,
          grammarIssues: feedback.grammarIssues,
          pronunciationFeedback: feedback.pronunciationFeedback,
          correction: feedback.correction,
        });
      } else {
        setEvaluation(data.evaluation || null);
      }

      if (analysis) {
        setScoring({
          pronunciation_score: analysis.pronunciationScore,
          prosody_score: analysis.prosodyScore,
          details: analysis.pronunciationAnalysis,
          recognized_text: analysis.transcription,
          confidence_score: analysis.confidenceScore,
        });
      } else {
        setScoring(data.scoring || null);
      }
    } catch (error: any) {
      console.error('Error submitting audio:', error);
      const errorMessage =
        error.response?.data?.error?.detail ||
        error.response?.data?.status?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to process audio';
      alert(`Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRecorded = async () => {
    if (!mediaBlobUrl) return;
    const blob = await fetch(mediaBlobUrl).then((r) => r.blob());
    await processAudioData(blob, 'recording.wav');
  };

  const handleSubmitUploaded = async () => {
    if (!selectedFile) return;
    await processAudioData(selectedFile, selectedFile.name);
  };

  const playCorrectionAudio = async (textToSpeak: string) => {
    if (!textToSpeak || playingAudio) return;

    setPlayingAudio(true);
    let audioUrl: string | null = null;

    try {
      const response = await axios.post(
        'http://localhost:3000/api/tts-generate',
        { text: textToSpeak },
        { responseType: 'arraybuffer' }
      );

      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      await new Promise<void>((resolve) => {
        audio.onended = () => resolve();
        audio.play().catch((playError) => {
          console.error('Error playing audio:', playError);
          resolve();
        });
      });
    } catch (error) {
      console.error('Error fetching or playing TTS audio:', error);
      alert('播放参考音频失败。');
    } finally {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setPlayingAudio(false);
    }
  };

  const moveSentence = (direction: -1 | 1) => {
    if (!hasSentenceMode) return;
    setCurrentSentenceIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return 0;
      if (next >= sentences.length) return sentences.length - 1;
      return next;
    });
    setLastPracticedSentence('');
    setTranscription('');
    setEvaluation(null);
    setScoring(null);
  };

  const canPassCurrentSentence =
    (scoring?.pronunciation_score ?? 0) >= 80 && (scoring?.prosody_score ?? 0) >= 75;

  return (
    <div className="recorder-container">
      <div className="recorder-header">
        <h2>口语练习工作台</h2>
        <p className="recorder-subtitle">逐句跟读、即时评测、立刻重读。</p>
      </div>

      <div className="controls-section">
        <div className="control-card control-card-wide">
          <h3>参考文本（跟读模式）</h3>
          <textarea
            className="reference-text-input"
            placeholder="输入一段英文，系统会自动按句拆分进行跟读练习..."
            value={referenceText}
            onChange={(e) => handleReferenceTextChange(e.target.value)}
            rows={5}
          />

          {hasSentenceMode && (
            <div className="sentence-panel">
              <div className="sentence-panel-header">
                <span>当前句子</span>
                <span>{currentSentenceIndex + 1} / {sentences.length}</span>
              </div>
              <div className="sentence-card">{currentSentence}</div>
              <div className="sentence-actions">
                <button className="btn-outline" onClick={() => moveSentence(-1)} disabled={currentSentenceIndex === 0}>
                  上一句
                </button>
                <button className="btn-primary" onClick={() => playCorrectionAudio(currentSentence)} disabled={!currentSentence || playingAudio}>
                  {playingAudio ? '播放中...' : '播放当前句'}
                </button>
                <button
                  className="btn-outline"
                  onClick={() => moveSentence(1)}
                  disabled={currentSentenceIndex >= sentences.length - 1}
                >
                  下一句
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="controls-section">
        <div className="control-card">
          <h3>录音评测</h3>
          <span className={`status-label ${status === 'recording' ? 'recording' : ''}`}>
            状态：{status.toUpperCase()}
          </span>

          <div className="button-group">
            <button className="btn-primary" onClick={startRecording} disabled={status === 'recording'}>
              开始录音
            </button>
            <button className="btn-secondary" onClick={stopRecording} disabled={status !== 'recording'}>
              停止录音
            </button>
            <button className="btn-outline" onClick={clearBlobUrl} disabled={!mediaBlobUrl}>
              清除
            </button>
          </div>

          {mediaBlobUrl && (
            <div className="player-wrapper">
              <audio src={mediaBlobUrl} controls className="audio-player" />
              <button className="btn-accent" onClick={handleSubmitRecorded} disabled={loading}>
                {loading ? '处理中...' : '提交当前录音'}
              </button>
            </div>
          )}
        </div>

        <div className="control-card">
          <h3>上传音频（调试）</h3>
          <div className="upload-box">
            <input type="file" accept="audio/*" onChange={handleFileUpload} className="file-input" />
          </div>
          {selectedFile && (
            <div className="player-wrapper">
              <p className="selected-file">已选择：{selectedFile.name}</p>
              <button className="btn-accent" onClick={handleSubmitUploaded} disabled={loading}>
                {loading ? '处理中...' : '提交上传文件'}
              </button>
            </div>
          )}
        </div>
      </div>

      {(transcription || evaluation || scoring || lastPracticedSentence) && (
        <div className="feedback-section">
          {lastPracticedSentence && (
            <div className="practice-summary">
              <div>
                <div className="summary-label">本次练习句</div>
                <div className="summary-text">{lastPracticedSentence}</div>
              </div>
              <div className={`pass-chip ${canPassCurrentSentence ? 'pass' : 'retry'}`}>
                {canPassCurrentSentence ? '当前句通过' : '建议继续重读'}
              </div>
            </div>
          )}

          {comparisonTokens.length > 0 && (
            <div className="comparison-box">
              <div className="comparison-title">文本对比</div>
              <div className="comparison-legend">
                <span className="legend-item legend-match">一致</span>
                <span className="legend-item legend-missing">漏读/错读</span>
                <span className="legend-item legend-extra">多读/识别偏差</span>
              </div>
              <div className="comparison-tokens">
                {comparisonTokens.map((token, index) => (
                  <span key={`${token.text}-${index}`} className={`comparison-token ${token.type}`}>
                    {token.text}
                  </span>
                ))}
              </div>
            </div>
          )}

          {transcription && (
            <div className="transcription-box">
              <strong>识别文本：</strong>{transcription}
            </div>
          )}

          {scoring && evaluation && (
            <div className="scores-grid">
              <div className="score-card pronunciation">
                <span>发音准确度</span>
                <span className="score-value">{scoring.pronunciation_score}</span>
              </div>
              <div className="score-card prosody">
                <span>语调节奏</span>
                <span className="score-value">{scoring.prosody_score}</span>
              </div>
              <div className="score-card overall">
                <span>综合反馈</span>
                <span className="score-value">{evaluation.score}</span>
              </div>
            </div>
          )}

          <div className="retry-row">
            <button className="btn-primary" onClick={() => playCorrectionAudio(lastPracticedSentence || activePracticeText)} disabled={playingAudio || !(lastPracticedSentence || activePracticeText)}>
              {playingAudio ? '播放中...' : '播放本句标准音频'}
            </button>
            <button className="btn-secondary" onClick={handleSubmitRecorded} disabled={loading || !mediaBlobUrl}>
              {loading ? '处理中...' : '重新录这一句'}
            </button>
            {hasSentenceMode && (
              <button
                className="btn-accent"
                onClick={() => moveSentence(1)}
                disabled={currentSentenceIndex >= sentences.length - 1}
              >
                进入下一句
              </button>
            )}
          </div>

          {evaluation && (
            <div className="ai-feedback-container">
              <h3>AI 反馈</h3>

              <div className="feedback-category">
                <h4>发音建议</h4>
                <ul className="feedback-list">
                  {evaluation.pronunciationFeedback.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>

              <div className="feedback-category">
                <h4>语法检查</h4>
                <ul className="feedback-list">
                  {evaluation.grammarIssues.length > 0 ? evaluation.grammarIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  )) : <li>当前句未发现明显语法问题。</li>}
                </ul>
              </div>

              <div className="feedback-category">
                <h4>更自然的表达</h4>
                <div className="correction-header">
                  <span>建议句子</span>
                  {evaluation.correction && (
                    <button
                      className="play-button"
                      onClick={() => playCorrectionAudio(evaluation.correction)}
                      disabled={playingAudio}
                      title="播放标准发音"
                    >
                      {playingAudio ? '播放中' : '播放'}
                    </button>
                  )}
                </div>
                <div className="correction-box">{evaluation.correction}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
