import fs from 'fs';
import path from 'path';

const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z']/g, '');

export class CmudictService {
  private readonly entries = new Map<string, string[][]>();

  constructor() {
    const dictPath = path.join(process.cwd(), 'resources', 'dicts', 'cmudict-0.7b-subset.txt');
    if (!fs.existsSync(dictPath)) {
      console.warn(`[CmudictService] Dictionary file not found: ${dictPath}`);
      return;
    }

    const content = fs.readFileSync(dictPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith(';;;')) {
        continue;
      }

      const parts = line.split(/\s+/);
      if (parts.length < 2) {
        continue;
      }

      const rawWord = parts[0];
      const phonemes = parts.slice(1);
      const normalized = normalizeWord(rawWord.replace(/\(\d+\)$/, ''));
      if (!normalized) {
        continue;
      }

      const current = this.entries.get(normalized) || [];
      current.push(phonemes);
      this.entries.set(normalized, current);
    }
  }

  lookup(word: string): string[] | null {
    const normalized = normalizeWord(word);
    if (!normalized) {
      return null;
    }

    const directMatch = this.entries.get(normalized)?.[0];
    if (directMatch) {
      return directMatch;
    }

    const possessiveMatch = this.entries.get(`${normalized}'s`)?.[0];
    if (possessiveMatch) {
      return possessiveMatch;
    }

    if (normalized.endsWith('s') && normalized.length > 2) {
      const singular = normalized.slice(0, -1);
      const singularPossessiveMatch = this.lookup(`${singular}'s`);
      if (singularPossessiveMatch) {
        return singularPossessiveMatch;
      }
    }

    if (normalized.endsWith('es') && normalized.length > 3) {
      const singular = normalized.slice(0, -2);
      const singularPossessiveMatch = this.lookup(`${singular}'s`);
      if (singularPossessiveMatch) {
        return singularPossessiveMatch;
      }
    }

    return null;
  }
}
