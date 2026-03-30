export type ProviderStatus = 'success' | 'partial' | 'error';

export interface LocalProsodyFeatures {
  durationSeconds: number;
  speechRatio: number;
  pauseCount: number;
  averagePauseMs: number;
  energyVariation: number;
  speechRate: number;
  warnings: string[];
}

export type WordAlignmentStatus = 'match' | 'missing' | 'extra' | 'substituted';

export interface WordAlignmentToken {
  expected: string;
  actual: string;
  status: WordAlignmentStatus;
}

export interface LocalProsodyAssessment {
  status: ProviderStatus;
  score: number;
  confidence: number;
  summary: string;
  features: LocalProsodyFeatures;
  processingTimeMs?: number;
  message?: string;
}

export interface CloudSpeechAssessment {
  status: ProviderStatus;
  recognizedText: string;
  pronunciationScore: number;
  prosodyScore: number;
  confidenceScore: number;
  details: string;
  processingTimeMs?: number;
  message?: string;
  rawResponse?: string;
}

export interface CloudAsrAssessment {
  status: ProviderStatus;
  transcript: string;
  processingTimeMs?: number;
  message?: string;
}

export type FusionStrategy =
  | 'cloud_primary'
  | 'blended'
  | 'local_fallback'
  | 'cloud_only'
  | 'asr_primary'
  | 'failed';

export interface AssessmentResult {
  status: ProviderStatus;
  transcription: string;
  scores: {
    pronunciation: number;
    prosody: number;
    confidence: number;
    overall: number;
  };
  providers: {
    local: LocalProsodyAssessment;
    cloud: CloudSpeechAssessment;
    asr: CloudAsrAssessment;
  };
  fusion: {
    strategy: FusionStrategy;
    chosenTranscriptionSource: 'asr' | 'cloud' | 'none';
    scoreWeights: {
      localProsody: number;
      cloudProsody: number;
    };
    conflictFlags: string[];
  };
  warnings: string[];
  learnerSafeSummary: string;
  wordAlignment: {
    referenceText: string;
    tokens: WordAlignmentToken[];
    mismatchCount: number;
  };
}
