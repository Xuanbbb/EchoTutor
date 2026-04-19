import { countScriptCharacters, PracticeLanguage } from './PracticeLanguage';

export type NaturalnessStatus = 'natural' | 'uncertain' | 'unnatural';

export interface TargetLanguageNaturalness {
  status: NaturalnessStatus;
  confidence: number;
  issue: '' | 'phonetic_transliteration' | 'wrong_language_or_mixed_language';
  reason: string;
  evidence: string[];
}

const emptyNaturalness = (reason = ''): TargetLanguageNaturalness => ({
  status: 'uncertain',
  confidence: 0,
  issue: '',
  reason,
  evidence: [],
});

const countMatches = (text: string, patterns: RegExp[]): string[] => {
  const evidence: string[] = [];
  patterns.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    matches.forEach((match) => {
      if (!evidence.includes(match)) {
        evidence.push(match);
      }
    });
  });
  return evidence;
};

const assessKorean = (text: string): TargetLanguageNaturalness => {
  const normalized = text.trim();
  if (!normalized) {
    return emptyNaturalness('No transcript available.');
  }

  const phoneticEvidence = countMatches(normalized, [
    /윗드|위드|애너멜|애니멀|노어멀리|노멀리|프레더터|프레데터|프레이|릴레이션십|이그젬플|이그잼플|도그|타이거|피글릿|피글리츠|캣|페러트|치터|치와와/gu,
    /[가-힣]*(?:션|터|더|즈|스|트|플|그|릿|십|멀리)[가-힣]*/gu,
  ]);
  const particles = normalized.match(/[은는이가을를에게에서으로와과도의]|입니다|합니다|한다|된다|였다|했다|예요|이에요|어요|아요/g) || [];

  if (phoneticEvidence.length >= 3 && particles.length <= 2) {
    return {
      status: 'unnatural',
      confidence: 86,
      issue: 'phonetic_transliteration',
      reason: 'The Korean-script transcript looks like phonetic transliteration of foreign speech rather than a natural Korean sentence.',
      evidence: phoneticEvidence.slice(0, 8),
    };
  }

  if (phoneticEvidence.length >= 5) {
    return {
      status: 'unnatural',
      confidence: 78,
      issue: 'phonetic_transliteration',
      reason: 'The transcript contains many Korean phonetic renderings of likely foreign words.',
      evidence: phoneticEvidence.slice(0, 8),
    };
  }

  return {
    status: 'natural',
    confidence: 55,
    issue: '',
    reason: 'No strong transliteration pattern was detected.',
    evidence: [],
  };
};

const assessJapanese = (text: string): TargetLanguageNaturalness => {
  const normalized = text.trim();
  if (!normalized) {
    return emptyNaturalness('No transcript available.');
  }

  const katakana = (normalized.match(/[\u30a0-\u30ff]/g) || []).length;
  const hiragana = (normalized.match(/[\u3040-\u309f]/g) || []).length;
  const kanji = (normalized.match(/[\u4e00-\u9fff]/g) || []).length;
  const phoneticEvidence = countMatches(normalized, [
    /ウィズ|アニマル|ノーマリー|プレデター|プレイ|リレーションシップ|イグザンプル|ドッグ|タイガー|キャット|フェレット|チワワ/gu,
    /[ァ-ヶー]{4,}/gu,
  ]);

  if (katakana >= 8 && katakana > (hiragana + kanji) * 1.8 && phoneticEvidence.length >= 2) {
    return {
      status: 'unnatural',
      confidence: 84,
      issue: 'phonetic_transliteration',
      reason: 'The Japanese-script transcript is dominated by katakana foreign-word transcription and lacks normal Japanese sentence structure.',
      evidence: phoneticEvidence.slice(0, 8),
    };
  }

  return {
    status: 'natural',
    confidence: 55,
    issue: '',
    reason: 'No strong transliteration pattern was detected.',
    evidence: [],
  };
};

const assessChinese = (text: string): TargetLanguageNaturalness => {
  const normalized = text.trim();
  if (!normalized) {
    return emptyNaturalness('No transcript available.');
  }

  const phoneticEvidence = countMatches(normalized, [
    /威德|维德|阿尼玛|诺玛丽|普雷德|普雷|瑞雷申|关系西普|伊格赞|多格|泰格|凯特|费雷特|奇瓦瓦/gu,
    /[一-龥]{2,}(?:特|德|斯|普|格|塔|克|瑞|弗|雷|什|森|逊)/gu,
  ]);
  const functionWords = normalized.match(/的|了|在|是|有|和|与|把|被|因为|所以|如果|但是|通常|例如/g) || [];

  if (phoneticEvidence.length >= 3 && functionWords.length <= 2) {
    return {
      status: 'unnatural',
      confidence: 78,
      issue: 'phonetic_transliteration',
      reason: 'The Chinese-script transcript looks like phonetic transcription of foreign speech rather than a natural Chinese sentence.',
      evidence: phoneticEvidence.slice(0, 8),
    };
  }

  return {
    status: 'natural',
    confidence: 52,
    issue: '',
    reason: 'No strong transliteration pattern was detected.',
    evidence: [],
  };
};

const assessLatinTarget = (text: string, language: PracticeLanguage): TargetLanguageNaturalness => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return emptyNaturalness('No transcript available.');
  }

  const counts = countScriptCharacters(text);
  if (counts.korean > 0 || counts.japanese > 0 || counts.chinese > Math.max(2, counts.latin)) {
    return {
      status: 'unnatural',
      confidence: 88,
      issue: 'wrong_language_or_mixed_language',
      reason: 'The transcript uses a writing system that does not match the selected Latin-script practice language.',
      evidence: [text.slice(0, 80)],
    };
  }

  if (language === 'es-ES') {
    const spanishMarkers = normalized.match(/\b(el|la|los|las|un|una|de|que|y|en|para|con|por|es|son|est[aá]|como)\b/g) || [];
    const englishMarkers = normalized.match(/\b(the|and|with|who|normally|for|example|relationship|friend)\b/g) || [];
    if (englishMarkers.length >= 3 && spanishMarkers.length <= 1) {
      return {
        status: 'unnatural',
        confidence: 74,
        issue: 'wrong_language_or_mixed_language',
        reason: 'The transcript looks more like English than natural Spanish.',
        evidence: englishMarkers.slice(0, 8),
      };
    }
  }

  if (language === 'fr-FR') {
    const frenchMarkers = normalized.match(/\b(le|la|les|un|une|des|de|du|que|et|en|pour|avec|est|sont|comme)\b/g) || [];
    const englishMarkers = normalized.match(/\b(the|and|with|who|normally|for|example|relationship|friend)\b/g) || [];
    if (englishMarkers.length >= 3 && frenchMarkers.length <= 1) {
      return {
        status: 'unnatural',
        confidence: 74,
        issue: 'wrong_language_or_mixed_language',
        reason: 'The transcript looks more like English than natural French.',
        evidence: englishMarkers.slice(0, 8),
      };
    }
  }

  return {
    status: 'natural',
    confidence: 50,
    issue: '',
    reason: 'No strong wrong-language pattern was detected.',
    evidence: [],
  };
};

export const assessTargetLanguageNaturalness = (
  text: string,
  language: PracticeLanguage,
): TargetLanguageNaturalness => {
  if (language === 'ko-KR') {
    return assessKorean(text);
  }
  if (language === 'ja-JP') {
    return assessJapanese(text);
  }
  if (language === 'zh-CN') {
    return assessChinese(text);
  }
  if (language === 'en-US' || language === 'es-ES' || language === 'fr-FR') {
    return assessLatinTarget(text, language);
  }

  return emptyNaturalness('Naturalness detection is not available for auto mode.');
};
