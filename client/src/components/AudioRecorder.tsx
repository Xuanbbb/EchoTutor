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
  wordAlignment?: {
    referenceText: string;
    mismatchCount: number;
    tokens: Array<{
      expected: string;
      actual: string;
      status: 'match' | 'missing' | 'extra' | 'substituted';
    }>;
  };
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
  actualText?: string;
}

type ViewMode = 'practice' | 'processing' | 'result';
type ResultTab = 'feedback' | 'correction' | 'transcript';
type InputMode = 'text' | 'record' | 'upload';

const inputModeLabels: Record<InputMode, string> = {
  text: '输入参考文本',
  record: '录音评测',
  upload: '上传音频文件',
};

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

const buildDiffTokensFromAlignment = (alignment?: AnalysisResult['wordAlignment']): DiffToken[] => {
  if (!alignment) {
    return [];
  }

  const diffTokens: DiffToken[] = [];

  alignment.tokens.forEach((token) => {
    if (token.status === 'match') {
      diffTokens.push({ text: token.actual || token.expected, type: 'match' });
      return;
    }

    if (token.status === 'missing') {
      diffTokens.push({ text: token.expected, type: 'missing' });
      return;
    }

    if (token.status === 'extra') {
      diffTokens.push({ text: token.actual, type: 'extra' });
      return;
    }

    diffTokens.push({
      text: token.expected,
      type: 'missing',
      actualText: token.actual,
    });
  });

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
  const [viewMode, setViewMode] = useState<ViewMode>('practice');
  const [resultTab, setResultTab] = useState<ResultTab>('feedback');
  const [showDiffDetails, setShowDiffDetails] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [isFollowReadingMode, setIsFollowReadingMode] = useState(false);
  const [wordAlignment, setWordAlignment] = useState<AnalysisResult['wordAlignment'] | null>(null);

  const sentences = splitIntoSentences(referenceText);
  const hasSentenceMode = isFollowReadingMode && sentences.length > 0;
  const currentSentence = hasSentenceMode ? sentences[Math.min(currentSentenceIndex, sentences.length - 1)] : '';
  const activePracticeText = currentSentence || referenceText.trim();
  const comparisonTokens = wordAlignment
    ? buildDiffTokensFromAlignment(wordAlignment)
    : (lastPracticedSentence ? buildDiffTokens(lastPracticedSentence, transcription) : []);
  const differenceCount = comparisonTokens.filter((token) => token.type !== 'match').length;
  const hasResult = Boolean(transcription || evaluation || scoring || lastPracticedSentence);
  const canPassCurrentSentence =
    (scoring?.pronunciation_score ?? 0) >= 80 && (scoring?.prosody_score ?? 0) >= 75;
  const followReadingSourceText = evaluation?.correction?.trim() || transcription.trim();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleReferenceTextChange = (value: string) => {
    setReferenceText(value);
    setCurrentSentenceIndex(0);
    setIsFollowReadingMode(false);
    setLastPracticedSentence('');
    setTranscription('');
    setWordAlignment(null);
    setEvaluation(null);
    setScoring(null);
    setViewMode('practice');
  };

  const activateFollowReading = (text: string) => {
    const normalizedText = text.trim();
    if (!normalizedText) return;
    setReferenceText(normalizedText);
    setCurrentSentenceIndex(0);
    setIsFollowReadingMode(true);
    setViewMode('practice');
    setInputMode('record');
    resetResultPanel();
  };

  const exitFollowReadingMode = (clearReference = false) => {
    setIsFollowReadingMode(false);
    setCurrentSentenceIndex(0);
    setInputMode('text');
    setViewMode('practice');
    resetCurrentResult();
    if (clearReference) {
      setReferenceText('');
    }
  };

  const resetResultPanel = () => {
    setResultTab('feedback');
    setShowDiffDetails(false);
  };

  const processAudioData = async (audioData: Blob | File, fileName: string) => {
    setLoading(true);
    setEvaluation(null);
    setScoring(null);
    setTranscription('');
    setWordAlignment(null);
    setViewMode('processing');
    resetResultPanel();

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
      const nextTranscription = analysis?.transcription || data.transcription || '';

      setTranscription(nextTranscription);
      setWordAlignment(analysis?.wordAlignment || null);

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

      setResultTab(nextTranscription ? 'feedback' : 'transcript');
      setViewMode('result');
    } catch (error: unknown) {
      console.error('Error submitting audio:', error);
      const axiosError = axios.isAxiosError(error) ? error : null;
      const genericError = error instanceof Error ? error : null;
      const errorMessage =
        axiosError?.response?.data?.error?.detail ||
        axiosError?.response?.data?.status?.message ||
        axiosError?.response?.data?.error ||
        genericError?.message ||
        'Failed to process audio';
      setViewMode('practice');
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

  const resetCurrentResult = () => {
    setTranscription('');
    setEvaluation(null);
    setScoring(null);
    setLastPracticedSentence('');
    setWordAlignment(null);
    resetResultPanel();
  };

  const moveSentence = (direction: -1 | 1) => {
    if (!hasSentenceMode) return;
    setCurrentSentenceIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return 0;
      if (next >= sentences.length) return sentences.length - 1;
      return next;
    });
    resetCurrentResult();
    setViewMode('practice');
  };

  const handleRetryCurrentSentence = () => {
    setViewMode('practice');
    resetResultPanel();
    setInputMode('record');
  };

  const handleNextSentence = () => {
    if (!hasSentenceMode || currentSentenceIndex >= sentences.length - 1) return;
    moveSentence(1);
  };

  const renderPracticePage = () => (
    <div className="practice-layout">
      <div className="page-topbar">
        <div>
          <h2>{inputModeLabels[inputMode]}</h2>
        </div>
        <div className="topbar-actions">
          {hasSentenceMode && (
            <div className="progress-pill">
              {currentSentenceIndex + 1} / {sentences.length}
            </div>
          )}
          {hasResult && (
            <button className="btn-outline" onClick={() => setViewMode('result')}>
              查看上次结果
            </button>
          )}
        </div>
      </div>

      <div className="practice-main-layout">
        <div className="mode-switcher mode-switcher-vertical">
          <button
            className={`mode-button ${inputMode === 'text' ? 'active' : ''}`}
            onClick={() => exitFollowReadingMode(false)}
          >
            参考文本
          </button>
          <button
            className={`mode-button ${inputMode === 'record' ? 'active' : ''}`}
            onClick={() => setInputMode('record')}
          >
            录音输入
          </button>
          <button
            className={`mode-button ${inputMode === 'upload' ? 'active' : ''}`}
            onClick={() => setInputMode('upload')}
          >
            文件上传
          </button>
        </div>

        <div className="practice-content-column">
          {isFollowReadingMode && hasSentenceMode && (
            <div className="focus-card focus-card-compact">
              <div className="focus-card-header">
                <div className="focus-card-heading">
                  <div className="eyebrow">当前跟读句</div>
                  <button
                    className="icon-button icon-button-primary sentence-play-button"
                    onClick={() => playCorrectionAudio(activePracticeText)}
                    disabled={!activePracticeText || playingAudio}
                    title={playingAudio ? '???' : '????'}
                    aria-label="????"
                  >
                    {'▶'}
                  </button>
                </div>
                <div className={`pass-chip ${canPassCurrentSentence && hasResult ? 'pass' : 'retry'}`}>
                  {hasResult ? (canPassCurrentSentence ? '上次结果：通过' : '上次结果：建议重读') : '等待本轮评测'}
                </div>
              </div>

              <div className="inline-actions">
                <button className="btn-outline" onClick={() => exitFollowReadingMode(false)}>
                  退出跟读
                </button>
                <button className="btn-secondary" onClick={() => exitFollowReadingMode(true)}>
                  新建练习句子
                </button>
              </div>

              <div className="focus-sentence-shell">
                <button
                  className="icon-button sentence-nav-button sentence-nav-button-left"
                  onClick={() => moveSentence(-1)}
                  disabled={!hasSentenceMode || currentSentenceIndex === 0}
                  title="???"
                  aria-label="???"
                >
                  {'<'}
                </button>
                <div className="focus-sentence-row">
                  <div className="focus-sentence">{activePracticeText}</div>
                  
                </div>
                <button
                  className="icon-button sentence-nav-button sentence-nav-button-right"
                  onClick={() => moveSentence(1)}
                  disabled={!hasSentenceMode || currentSentenceIndex >= sentences.length - 1}
                  title="???"
                  aria-label="???"
                >
                  {'>'}
                </button>
              </div>
            </div>
          )}

          {inputMode === 'text' && !isFollowReadingMode && (
            <div className="control-card control-card-wide">
              <h3>参考文本</h3>
              <textarea
                className="reference-text-input"
                placeholder="输入一段英文，系统会自动按句拆分并进入跟读练习..."
                value={referenceText}
                onChange={(e) => handleReferenceTextChange(e.target.value)}
                rows={5}
              />

              <div className="inline-actions">
                <button
                  className="btn-primary"
                  onClick={() => activateFollowReading(referenceText)}
                  disabled={!referenceText.trim()}
                >
                  进入跟读模式
                </button>
              </div>

              {isFollowReadingMode && hasSentenceMode && (
                <div className="sentence-panel">
                  <div className="sentence-panel-header">
                    <span>句子导航</span>
                    <span>{currentSentenceIndex + 1} / {sentences.length}</span>
                  </div>
                  <div className="sentence-card">{currentSentence}</div>
                </div>
              )}
            </div>
          )}

          {inputMode === 'record' && (
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
                    {loading ? '处理中...' : '提交评测'}
                  </button>
                </div>
              )}
            </div>
          )}

          {inputMode === 'upload' && (
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
          )}
        </div>
      </div>
    </div>
  );

  const renderProcessingPage = () => (
    <div className="processing-layout">
      <div className="processing-orb" />
      <div className="eyebrow">正在分析</div>
      <h2>AI 正在评估这句话</h2>
      <p>系统会先做音频识别和发音评分，再生成面向学习者的反馈。</p>
      {lastPracticedSentence && <div className="processing-quote">{lastPracticedSentence}</div>}
    </div>
  );

  const renderResultPage = () => (
    <div className="result-layout">
      <div className="page-topbar">
        <div>
          <div className="eyebrow">评测结果</div>
          <h2>本句复盘</h2>
        </div>
        <div className="topbar-actions">
          <button className="btn-outline" onClick={() => setViewMode('practice')}>
            返回练习页
          </button>
          {isFollowReadingMode && hasSentenceMode && (
            <div className="progress-pill">
              {currentSentenceIndex + 1} / {sentences.length}
            </div>
          )}
        </div>
      </div>

      <div className="result-hero">
        <div className="result-hero-main">
          <div className="summary-label">本次练习句</div>
          <div className="summary-text">{lastPracticedSentence || activePracticeText || '未提供参考句。'}</div>
        </div>
        <div className={`result-badge ${canPassCurrentSentence ? 'pass' : 'retry'}`}>
          {canPassCurrentSentence ? '当前句通过' : '建议继续重读'}
        </div>
      </div>

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

      <div className="result-actions">
        <button
          className="btn-secondary"
          onClick={() => playCorrectionAudio(lastPracticedSentence || activePracticeText)}
          disabled={playingAudio || !(lastPracticedSentence || activePracticeText)}
        >
          {playingAudio ? '播放中...' : '播放标准音频'}
        </button>
        <button className="btn-primary" onClick={handleRetryCurrentSentence}>
          再练一次
        </button>
        <button
          className="btn-outline"
          onClick={() => activateFollowReading(followReadingSourceText)}
          disabled={!followReadingSourceText}
        >
          转为跟读模式
        </button>
        {isFollowReadingMode && hasSentenceMode && (
          <button
            className="btn-accent"
            onClick={handleNextSentence}
            disabled={currentSentenceIndex >= sentences.length - 1}
          >
            下一句
          </button>
        )}
      </div>

      {comparisonTokens.length > 0 && (
        <div className="comparison-box">
          <div className="comparison-summary-row">
            <div>
              <div className="comparison-title">文本对比</div>
              <div className="summary-label">
                {differenceCount > 0 ? `识别结果与目标句存在 ${differenceCount} 处差异` : '识别文本与目标句基本一致'}
              </div>
            </div>
            <button className="btn-outline" onClick={() => setShowDiffDetails((prev) => !prev)}>
              {showDiffDetails ? '收起详情' : '展开详情'}
            </button>
          </div>

          {showDiffDetails && (
            <>
              <div className="comparison-legend">
                <span className="legend-item legend-match">一致</span>
                <span className="legend-item legend-missing">漏读/错读</span>
                <span className="legend-item legend-extra">多读/识别偏差</span>
              </div>
              <div className="comparison-tokens">
                {comparisonTokens.map((token, index) => (
                  <span key={`${token.text}-${index}`} className={`comparison-token ${token.type}`}>
                    {token.actualText ? `${token.text} -> ${token.actualText}` : token.text}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="ai-feedback-container">
        <div className="tab-row">
          <button
            className={`tab-button ${resultTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setResultTab('feedback')}
          >
            发音建议
          </button>
          <button
            className={`tab-button ${resultTab === 'correction' ? 'active' : ''}`}
            onClick={() => setResultTab('correction')}
          >
            表达修正
          </button>
          <button
            className={`tab-button ${resultTab === 'transcript' ? 'active' : ''}`}
            onClick={() => setResultTab('transcript')}
          >
            识别文本
          </button>
        </div>

        {resultTab === 'feedback' && evaluation && (
          <div className="feedback-panel feedback-panel-fixed">
            <div className="feedback-category">
              <h4>发音建议</h4>
              <ul className="feedback-list">
                {evaluation.pronunciationFeedback.length > 0 ? (
                  evaluation.pronunciationFeedback.map((issue, idx) => <li key={idx}>{issue}</li>)
                ) : (
                  <li>本次未返回额外发音建议。</li>
                )}
              </ul>
            </div>

            <div className="feedback-category">
              <h4>语法检查</h4>
              <ul className="feedback-list">
                {evaluation.grammarIssues.length > 0 ? (
                  evaluation.grammarIssues.map((issue, idx) => <li key={idx}>{issue}</li>)
                ) : (
                  <li>当前句未发现明显语法问题。</li>
                )}
              </ul>
            </div>
          </div>
        )}

        {resultTab === 'correction' && evaluation && (
          <div className="feedback-panel feedback-panel-fixed">
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
                    {playingAudio ? '播放中...' : '播放'}
                  </button>
                )}
              </div>
              <div className="correction-box">{evaluation.correction || '当前没有改写建议。'}</div>
            </div>
          </div>
        )}

        {resultTab === 'transcript' && (
          <div className="feedback-panel feedback-panel-fixed">
            <div className="transcription-box">
              <strong>识别文本：</strong>
              {transcription || '当前没有识别结果。'}
            </div>
            {scoring?.details && (
              <div className="detail-note">
                <strong>模型分析：</strong>
                {scoring.details}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="recorder-container">
      <div className="recorder-header">
        <h2>口语练习工作台</h2>
        <p className="recorder-subtitle">逐句跟读、即时评测、快速切换练习与结果视图</p>
      </div>

      {viewMode === 'practice' && renderPracticePage()}
      {viewMode === 'processing' && renderProcessingPage()}
      {viewMode === 'result' && renderResultPage()}
    </div>
  );
};

export default AudioRecorder;
