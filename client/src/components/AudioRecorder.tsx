import React, { useState } from 'react';
import { useReactMediaRecorder } from 'react-media-recorder';
import axios from 'axios';

interface EvaluationResult {
  score: number;
  grammarIssues: string[];
  pronunciationFeedback: string;
  correction: string;
}

const AudioRecorder = () => {
  const { status, startRecording, stopRecording, mediaBlobUrl, clearBlob } =
    useReactMediaRecorder({ audio: true });

  const [transcription, setTranscription] = useState<string>('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
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
    try {
      const formData = new FormData();
      formData.append('audio', audioData, fileName);

      const response = await axios.post('http://localhost:3000/api/process-audio', formData);

      setTranscription(response.data.transcription);
      setEvaluation(response.data.evaluation);
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
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Oral Practice</h2>
      
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' }}>
        {/* Recording Section */}
        <div style={{ padding: '15px', border: '1px dashed #aaa', borderRadius: '8px', flex: 1 }}>
          <h3>Record Audio</h3>
          <p>Status: {status}</p>
          <div style={{ marginBottom: '10px' }}>
            <button onClick={startRecording} disabled={status === 'recording'}>
              Start
            </button>
            <button onClick={stopRecording} disabled={status !== 'recording'} style={{ marginLeft: '5px' }}>
              Stop
            </button>
            <button onClick={clearBlob} disabled={!mediaBlobUrl} style={{ marginLeft: '5px' }}>
              Clear
            </button>
          </div>
          {mediaBlobUrl && (
            <div>
              <audio src={mediaBlobUrl} controls style={{ width: '100%' }} />
              <button onClick={handleSubmitRecorded} disabled={loading} style={{ marginTop: '10px', width: '100%' }}>
                {loading ? 'Processing...' : 'Evaluate Recording'}
              </button>
            </div>
          )}
        </div>

        {/* Upload Section */}
        <div style={{ padding: '15px', border: '1px dashed #aaa', borderRadius: '8px', flex: 1 }}>
          <h3>Upload Audio (Debug)</h3>
          <input type="file" accept="audio/*" onChange={handleFileUpload} style={{ marginBottom: '10px' }} />
          {selectedFile && (
            <div>
              <p style={{ fontSize: '0.9em' }}>File: {selectedFile.name}</p>
              <button onClick={handleSubmitUploaded} disabled={loading} style={{ width: '100%' }}>
                {loading ? 'Processing...' : 'Evaluate Uploaded File'}
              </button>
            </div>
          )}
        </div>
      </div>

      {transcription && (
        <div style={{ marginTop: '20px', textAlign: 'left' }}>
          <h3>Transcription:</h3>
          <p>{transcription}</p>
        </div>
      )}

      {evaluation && (
        <div style={{ marginTop: '20px', textAlign: 'left', borderTop: '1px solid #eee', paddingTop: '10px' }}>
          <h3>Evaluation Result:</h3>
          <p><strong>Score:</strong> {evaluation.score}</p>
          <p><strong>Pronunciation:</strong> {evaluation.pronunciationFeedback}</p>
          <p><strong>Grammar:</strong></p>
          <ul>
            {evaluation.grammarIssues.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
          <p><strong>Correction:</strong> {evaluation.correction}</p>
        </div>
      )}
    </div>
  );
};

export default AudioRecorder;
