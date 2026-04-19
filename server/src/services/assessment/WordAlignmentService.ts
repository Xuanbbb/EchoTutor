import { WordAlignmentToken } from './types';
import { getPracticeLanguageConfig, PracticeLanguage } from '../PracticeLanguage';

const normalizeWordTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

const normalizeCharacterTokens = (text: string): string[] =>
  Array.from(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, ''),
  ).filter(Boolean);

const normalizeForAlignment = (text: string, language: PracticeLanguage): string[] => {
  const config = getPracticeLanguageConfig(language);

  if (config.tokenization === 'cjk-char') {
    return normalizeCharacterTokens(text);
  }

  return normalizeWordTokens(text);
};

export class WordAlignmentService {
  align(
    referenceText: string,
    transcription: string,
    language: PracticeLanguage = 'en-US',
  ): { tokens: WordAlignmentToken[]; mismatchCount: number } {
    const expectedTokens = normalizeForAlignment(referenceText, language);
    const actualTokens = normalizeForAlignment(transcription, language);

    if (expectedTokens.length === 0 && actualTokens.length === 0) {
      return { tokens: [], mismatchCount: 0 };
    }

    if (expectedTokens.length === 0 && actualTokens.length > 0) {
      return {
        tokens: actualTokens.map((token) => ({
          expected: token,
          actual: token,
          status: 'match' as const,
        })),
        mismatchCount: 0,
      };
    }

    const dp = this.buildEditTable(expectedTokens, actualTokens);
    const tokens = this.backtrack(expectedTokens, actualTokens, dp);
    const mismatchCount = tokens.filter((token) => token.status !== 'match').length;

    return { tokens, mismatchCount };
  }

  private buildEditTable(expectedTokens: string[], actualTokens: string[]): number[][] {
    const rows = expectedTokens.length + 1;
    const cols = actualTokens.length + 1;
    const dp = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));

    for (let i = 0; i < rows; i += 1) {
      dp[i][0] = i;
    }

    for (let j = 0; j < cols; j += 1) {
      dp[0][j] = j;
    }

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const substitutionCost = expectedTokens[i - 1] === actualTokens[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + substitutionCost,
        );
      }
    }

    return dp;
  }

  private backtrack(expectedTokens: string[], actualTokens: string[], dp: number[][]): WordAlignmentToken[] {
    const tokens: WordAlignmentToken[] = [];
    let i = expectedTokens.length;
    let j = actualTokens.length;

    while (i > 0 || j > 0) {
      const expected = i > 0 ? expectedTokens[i - 1] : '';
      const actual = j > 0 ? actualTokens[j - 1] : '';

      if (
        i > 0 &&
        j > 0 &&
        dp[i][j] === dp[i - 1][j - 1] &&
        expected === actual
      ) {
        tokens.push({ expected, actual, status: 'match' });
        i -= 1;
        j -= 1;
        continue;
      }

      if (
        i > 0 &&
        j > 0 &&
        dp[i][j] === dp[i - 1][j - 1] + 1
      ) {
        tokens.push({ expected, actual, status: 'substituted' });
        i -= 1;
        j -= 1;
        continue;
      }

      if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
        tokens.push({ expected, actual: '', status: 'missing' });
        i -= 1;
        continue;
      }

      tokens.push({ expected: '', actual, status: 'extra' });
      j -= 1;
    }

    return tokens.reverse();
  }
}
