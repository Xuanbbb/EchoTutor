export type PracticeLanguage =
  | 'auto'
  | 'en-US'
  | 'zh-CN'
  | 'ko-KR'
  | 'ja-JP'
  | 'es-ES'
  | 'fr-FR';

export interface PracticeLanguageConfig {
  code: PracticeLanguage;
  asrHint: '' | 'en-US' | 'zh-CN' | 'ko-KR' | 'ja-JP' | 'es-ES' | 'fr-FR';
  englishName: string;
  correctionLanguage: string;
  tokenization: 'latin-word' | 'cjk-char' | 'korean-word';
}

const languageConfigs: Record<PracticeLanguage, PracticeLanguageConfig> = {
  auto: {
    code: 'auto',
    asrHint: '',
    englishName: 'the target language',
    correctionLanguage: 'the detected target language',
    tokenization: 'latin-word',
  },
  'en-US': {
    code: 'en-US',
    asrHint: 'en-US',
    englishName: 'English',
    correctionLanguage: 'English',
    tokenization: 'latin-word',
  },
  'zh-CN': {
    code: 'zh-CN',
    asrHint: 'zh-CN',
    englishName: 'Simplified Chinese',
    correctionLanguage: 'Simplified Chinese',
    tokenization: 'cjk-char',
  },
  'ko-KR': {
    code: 'ko-KR',
    asrHint: 'ko-KR',
    englishName: 'Korean',
    correctionLanguage: 'Korean',
    tokenization: 'korean-word',
  },
  'ja-JP': {
    code: 'ja-JP',
    asrHint: 'ja-JP',
    englishName: 'Japanese',
    correctionLanguage: 'Japanese',
    tokenization: 'cjk-char',
  },
  'es-ES': {
    code: 'es-ES',
    asrHint: 'es-ES',
    englishName: 'Spanish',
    correctionLanguage: 'Spanish',
    tokenization: 'latin-word',
  },
  'fr-FR': {
    code: 'fr-FR',
    asrHint: 'fr-FR',
    englishName: 'French',
    correctionLanguage: 'French',
    tokenization: 'latin-word',
  },
};

export const normalizePracticeLanguage = (value: unknown): PracticeLanguage => {
  if (typeof value !== 'string') {
    return 'en-US';
  }

  return value in languageConfigs ? value as PracticeLanguage : 'en-US';
};

export const getPracticeLanguageConfig = (language: PracticeLanguage): PracticeLanguageConfig =>
  languageConfigs[language] || languageConfigs['en-US'];

export const inferPracticeLanguage = (referenceText: string): PracticeLanguage => {
  const text = referenceText.trim();
  if (!text) {
    return 'en-US';
  }

  const counts = {
    chinese: (text.match(/[\u4e00-\u9fff]/g) || []).length,
    japanese: (text.match(/[\u3040-\u30ff]/g) || []).length,
    korean: (text.match(/[\uac00-\ud7af]/g) || []).length,
    latin: (text.match(/[A-Za-z]/g) || []).length,
  };

  if (counts.korean > 0 && counts.korean >= counts.latin) {
    return 'ko-KR';
  }

  if (counts.japanese > 0 && counts.japanese >= counts.latin) {
    return 'ja-JP';
  }

  if (counts.chinese > 0 && counts.chinese >= counts.latin) {
    return 'zh-CN';
  }

  return 'en-US';
};

export const resolvePracticeLanguage = (
  requestedLanguage: PracticeLanguage,
  referenceText: string,
): PracticeLanguage => {
  if (requestedLanguage !== 'auto') {
    return requestedLanguage;
  }

  return referenceText.trim() ? inferPracticeLanguage(referenceText) : 'auto';
};

export const countScriptCharacters = (text: string) => ({
  latin: (text.match(/[A-Za-z]/g) || []).length,
  chinese: (text.match(/[\u4e00-\u9fff]/g) || []).length,
  japanese: (text.match(/[\u3040-\u30ff]/g) || []).length,
  korean: (text.match(/[\uac00-\ud7af]/g) || []).length,
});

export const isLikelyWrongScript = (text: string, language: PracticeLanguage): boolean => {
  const counts = countScriptCharacters(text);
  const nonLatin = counts.chinese + counts.japanese + counts.korean;

  if (language === 'en-US' || language === 'es-ES' || language === 'fr-FR') {
    return counts.korean > 0 || counts.japanese > 0 || counts.chinese > Math.max(2, counts.latin);
  }

  if (language === 'ko-KR') {
    return counts.korean === 0 && (counts.latin + counts.chinese + counts.japanese) > 0;
  }

  if (language === 'ja-JP') {
    return counts.japanese === 0 && counts.chinese === 0 && (counts.latin + counts.korean) > 0;
  }

  if (language === 'zh-CN') {
    return counts.chinese === 0 && (counts.latin + counts.japanese + counts.korean) > 0;
  }

  return false;
};
