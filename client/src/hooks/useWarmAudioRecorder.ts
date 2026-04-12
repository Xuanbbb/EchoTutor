import { useCallback, useEffect, useRef, useState } from 'react';

type RecorderStatus =
  | 'idle'
  | 'acquiring_media'
  | 'priming_audio'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'stopped'
  | 'error';

interface WarmAudioRecorderResult {
  status: RecorderStatus;
  mediaBlobUrl: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  clearBlobUrl: () => void;
}

const PRIME_THRESHOLD = 0.0005;
const PRIME_REQUIRED_HITS = 6;
const PROCESSOR_BUFFER_SIZE = 2048;

const pickMimeType = (): string | undefined => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return undefined;
  }

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];

  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
};

export const useWarmAudioRecorder = (): WarmAudioRecorderResult => {
  const mountedRef = useRef(true);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const silenceGainRef = useRef<GainNode | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaBlobUrlRef = useRef('');
  const isPrimedRef = useRef(false);
  const primeHitCountRef = useRef(0);
  const pendingStartRef = useRef(false);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [mediaBlobUrl, setMediaBlobUrl] = useState('');

  const clearBlobUrl = useCallback(() => {
    const currentUrl = mediaBlobUrlRef.current;
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
      mediaBlobUrlRef.current = '';
    }
    setMediaBlobUrl('');
  }, []);

  const startMediaRecorder = useCallback(() => {
    const stream = mediaStreamRef.current;
    if (!stream || mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    clearBlobUrl();
    mediaChunksRef.current = [];

    const mimeType = pickMimeType();
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        mediaChunksRef.current.push(event.data);
      }
    };

    recorder.onstart = () => {
      if (mountedRef.current) {
        setStatus('recording');
      }
    };

    recorder.onstop = () => {
      const chunkType = mediaChunksRef.current.find((chunk) => chunk.type)?.type || mimeType || 'audio/webm';
      const blob = new Blob(mediaChunksRef.current, { type: chunkType });
      const url = URL.createObjectURL(blob);

      if (mediaBlobUrlRef.current) {
        URL.revokeObjectURL(mediaBlobUrlRef.current);
      }
      mediaBlobUrlRef.current = url;

      if (mountedRef.current) {
        setMediaBlobUrl(url);
        setStatus('stopped');
      }
    };

    recorder.onerror = (event) => {
      console.error('MediaRecorder error:', event);
      if (mountedRef.current) {
        setStatus('error');
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
  }, [clearBlobUrl]);

  const ensureWarmStream = useCallback(async (): Promise<MediaStream> => {
    const existingStream = mediaStreamRef.current;
    if (existingStream && existingStream.active) {
      if (mountedRef.current) {
        setStatus((current) => {
          if (current === 'recording' || current === 'stopping') {
            return current;
          }
          return isPrimedRef.current ? 'ready' : 'priming_audio';
        });
      }
      return existingStream;
    }

    if (mountedRef.current) {
      setStatus('acquiring_media');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const audioContext = new AudioContext();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const sourceNode = audioContext.createMediaStreamSource(stream);
    const processorNode = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
    const silenceGain = audioContext.createGain();
    silenceGain.gain.value = 0;

    processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      let peak = 0;

      for (let index = 0; index < input.length; index += 1) {
        peak = Math.max(peak, Math.abs(input[index]));
      }

      if (peak > PRIME_THRESHOLD) {
        primeHitCountRef.current += 1;
      } else if (!isPrimedRef.current) {
        primeHitCountRef.current = 0;
      }

      if (!isPrimedRef.current && primeHitCountRef.current >= PRIME_REQUIRED_HITS) {
        isPrimedRef.current = true;
        if (mountedRef.current && (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording')) {
          setStatus('ready');
        }
        if (pendingStartRef.current) {
          pendingStartRef.current = false;
          startMediaRecorder();
        }
      }
    };

    sourceNode.connect(processorNode);
    processorNode.connect(silenceGain);
    silenceGain.connect(audioContext.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = audioContext;
    sourceNodeRef.current = sourceNode;
    processorNodeRef.current = processorNode;
    silenceGainRef.current = silenceGain;
    isPrimedRef.current = false;
    primeHitCountRef.current = 0;

    if (mountedRef.current) {
      setStatus('priming_audio');
    }

    return stream;
  }, [startMediaRecorder]);

  useEffect(() => {
    mountedRef.current = true;
    void ensureWarmStream().catch((error) => {
      console.error('Failed to initialize warm recorder:', error);
      if (mountedRef.current) {
        setStatus('error');
      }
    });

    return () => {
      mountedRef.current = false;
      clearBlobUrl();
      processorNodeRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      silenceGainRef.current?.disconnect();
      processorNodeRef.current = null;
      sourceNodeRef.current = null;
      silenceGainRef.current = null;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      void audioContextRef.current?.close().catch(() => {});
      audioContextRef.current = null;
    };
  }, [clearBlobUrl, ensureWarmStream]);

  const startRecording = useCallback(async () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      return;
    }

    try {
      await ensureWarmStream();
      if (isPrimedRef.current) {
        startMediaRecorder();
        return;
      }

      pendingStartRef.current = true;
      if (mountedRef.current) {
        setStatus('priming_audio');
      }
    } catch (error) {
      console.error('Failed to start recording on warm stream:', error);
      if (mountedRef.current) {
        setStatus('error');
      }
    }
  }, [ensureWarmStream, startMediaRecorder]);

  const stopRecording = useCallback(() => {
    pendingStartRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') {
      return;
    }

    setStatus('stopping');
    recorder.stop();
    mediaRecorderRef.current = null;
  }, []);

  return {
    status,
    mediaBlobUrl,
    startRecording,
    stopRecording,
    clearBlobUrl,
  };
};

export default useWarmAudioRecorder;
