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
  details: string;
  recognized_text: string;
}

const AudioRecorder = () => {
  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlobUrl } =
    useReactMediaRecorder({ audio: true });

  const [transcription, setTranscription] = useState<string>('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [scoring, setScoring] = useState<ScoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const processAudioData = async (audioData: Blob | File, fileName: string) => {
    setLoading(true);
    setEvaluation(null);
    setScoring(null);
    setTranscription('');

    try {
      const formData = new FormData();
      formData.append('audio', audioData, fileName);
      // Optional: Add reference text if you have a UI for it
      // formData.append('referenceText', "Hello world"); 

      const response = await axios.post('http://localhost:3000/api/process-audio', formData);

      setTranscription(response.data.transcription);
      setEvaluation(response.data.evaluation);
      setScoring(response.data.scoring);

    } catch (error: any) {
      console.error('Error submitting audio:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to process audio';
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

  return (
    <div className="recorder-container">
      <div className="recorder-header">
        <h2>Oral Practice Studio</h2>
      </div>

      <div className="controls-section">
        {/* Recording Section */}
        <div className="control-card">
          <h3>🎙️ Record Audio</h3>
          <span className={`status-label ${status === 'recording' ? 'recording' : ''}`}>
            Status: {status.toUpperCase()}
          </span>

          <div className="button-group">
            <button
              className="btn-primary"
              onClick={startRecording}
              disabled={status === 'recording'}
            >
              Start
            </button>
            <button
              className="btn-secondary"
              onClick={stopRecording}
              disabled={status !== 'recording'}
            >
              Stop
            </button>
            <button
              className="btn-outline"
              onClick={clearBlobUrl}
              disabled={!mediaBlobUrl}
            >
              Clear
            </button>
          </div>

          {mediaBlobUrl && (
            <div className="player-wrapper">
              <audio src={mediaBlobUrl} controls className="audio-player" />
              <button
                className="btn-accent"
                onClick={handleSubmitRecorded}
                disabled={loading}
              >
                {loading ? 'Processing...' : '✨ Evaluate Recording'}
              </button>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div className="control-card">
          <h3>📂 Upload File (Debug)</h3>
          <div style={{ width: '100%', marginBottom: 'auto' }}>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileUpload}
              className="file-input"
            />
          </div>
          {selectedFile && (
            <div className="player-wrapper">
              <p style={{ fontSize: '0.9em', color: '#666' }}>Selected: {selectedFile.name}</p>
              <button
                className="btn-accent"
                onClick={handleSubmitUploaded}
                disabled={loading}
              >
                {loading ? 'Processing...' : '✨ Evaluate File'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results Display */}
      {(transcription || evaluation || scoring) && (
        <div className="feedback-section">
          {transcription && (
            <div className="transcription-box">
              <strong>Transcription:</strong> "{transcription}"
            </div>
          )}

          {scoring && evaluation && (
            <div className="scores-grid">
              <div className="score-card pronunciation">
                <span>Pronunciation</span>
                <span className="score-value">{scoring.pronunciation_score}</span>
              </div>
              <div className="score-card prosody">
                <span>Prosody</span>
                <span className="score-value">{scoring.prosody_score}</span>
              </div>
              <div className="score-card overall">
                <span>Overall</span>
                <span className="score-value">{evaluation.score}</span>
              </div>
            </div>
          )}

          {evaluation && (
            <div className="ai-feedback-container">
              <h3>🤖 AI Feedback</h3>

              <div className="feedback-category">
                <h4>Pronunciation Advice</h4>
                <ul className="feedback-list">
                  {evaluation.pronunciationFeedback.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>

              <div className="feedback-category">
                <h4>Grammar Check</h4>
                <ul className="feedback-list">
                  {evaluation.grammarIssues.map((issue, idx) => (
                    <li key={idx}>{issue}</li>
                  ))}
                </ul>
              </div>

              <div className="feedback-category">
                <h4>Better Expression</h4>
                <div className="correction-box">
                  {evaluation.correction}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
