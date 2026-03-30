const IRREGULAR_IPA: Record<string, string> = {
  a: 'ə',
  an: 'æn',
  are: 'ɑr',
  be: 'biː',
  bread: 'bred',
  comfortable: 'ˈkʌmftəbəl',
  could: 'kʊd',
  do: 'duː',
  done: 'dʌn',
  english: 'ˈɪŋɡlɪʃ',
  every: 'ˈevri',
  good: 'ɡʊd',
  have: 'hæv',
  heard: 'hɝd',
  height: 'haɪt',
  hour: 'aʊər',
  idea: 'aɪˈdiːə',
  is: 'ɪz',
  language: 'ˈlæŋɡwɪdʒ',
  learn: 'lɝn',
  of: 'əv',
  often: 'ˈɔfən',
  one: 'wʌn',
  people: 'ˈpiːpəl',
  probably: 'ˈprɑbəbli',
  question: 'ˈkwestʃən',
  read: 'riːd',
  said: 'sed',
  should: 'ʃʊd',
  speak: 'spiːk',
  sure: 'ʃʊr',
  the: 'ðə',
  their: 'ðer',
  there: 'ðer',
  they: 'ðeɪ',
  through: 'θruː',
  to: 'tuː',
  was: 'wʌz',
  were: 'wɝ',
  what: 'wʌt',
  where: 'wer',
  who: 'huː',
  whole: 'hoʊl',
  would: 'wʊd',
  you: 'juː',
  your: 'jʊr',
};

const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z']/g, '');

const replaceOnce = (value: string, pattern: RegExp, replacement: string) => value.replace(pattern, replacement);

export class PronunciationGuideService {
  toIpa(word: string): string {
    const normalized = normalizeWord(word);
    if (!normalized) {
      return '';
    }

    const irregular = IRREGULAR_IPA[normalized];
    if (irregular) {
      return irregular;
    }

    let ipa = normalized;

    ipa = replaceOnce(ipa, /^x/, 'z');
    ipa = ipa.replace(/tion/g, 'ʃən');
    ipa = ipa.replace(/sion/g, 'ʒən');
    ipa = ipa.replace(/ture/g, 'tʃər');
    ipa = ipa.replace(/ough/g, 'oʊ');
    ipa = ipa.replace(/eigh/g, 'eɪ');
    ipa = ipa.replace(/igh/g, 'aɪ');
    ipa = ipa.replace(/ph/g, 'f');
    ipa = ipa.replace(/sh/g, 'ʃ');
    ipa = ipa.replace(/ch/g, 'tʃ');
    ipa = ipa.replace(/th/g, 'θ');
    ipa = ipa.replace(/wh/g, 'w');
    ipa = ipa.replace(/ck/g, 'k');
    ipa = ipa.replace(/qu/g, 'kw');
    ipa = ipa.replace(/ng/g, 'ŋ');
    ipa = ipa.replace(/ee/g, 'iː');
    ipa = ipa.replace(/ea/g, 'iː');
    ipa = ipa.replace(/oo/g, 'uː');
    ipa = ipa.replace(/ou/g, 'aʊ');
    ipa = ipa.replace(/ow/g, 'oʊ');
    ipa = ipa.replace(/oi/g, 'ɔɪ');
    ipa = ipa.replace(/oy/g, 'ɔɪ');
    ipa = ipa.replace(/ai/g, 'eɪ');
    ipa = ipa.replace(/ay/g, 'eɪ');
    ipa = ipa.replace(/oa/g, 'oʊ');
    ipa = ipa.replace(/au/g, 'ɔ');
    ipa = ipa.replace(/er\b/g, 'ər');
    ipa = ipa.replace(/ir\b/g, 'ər');
    ipa = ipa.replace(/ur\b/g, 'ər');
    ipa = ipa.replace(/ar/g, 'ɑr');
    ipa = ipa.replace(/or/g, 'ɔr');
    ipa = ipa.replace(/a\b/g, 'ə');
    ipa = ipa.replace(/e\b/g, '');
    ipa = ipa.replace(/i\b/g, 'aɪ');
    ipa = ipa.replace(/o\b/g, 'oʊ');
    ipa = ipa.replace(/u\b/g, 'juː');

    ipa = ipa
      .replace(/a/g, 'æ')
      .replace(/b/g, 'b')
      .replace(/c/g, 'k')
      .replace(/d/g, 'd')
      .replace(/e/g, 'e')
      .replace(/f/g, 'f')
      .replace(/g/g, 'ɡ')
      .replace(/h/g, 'h')
      .replace(/i/g, 'ɪ')
      .replace(/j/g, 'dʒ')
      .replace(/k/g, 'k')
      .replace(/l/g, 'l')
      .replace(/m/g, 'm')
      .replace(/n/g, 'n')
      .replace(/o/g, 'ɑ')
      .replace(/p/g, 'p')
      .replace(/r/g, 'r')
      .replace(/s/g, 's')
      .replace(/t/g, 't')
      .replace(/u/g, 'ʌ')
      .replace(/v/g, 'v')
      .replace(/w/g, 'w')
      .replace(/x/g, 'ks')
      .replace(/y/g, 'j')
      .replace(/z/g, 'z');

    ipa = ipa
      .replace(/əər/g, 'ər')
      .replace(/ii/g, 'iː')
      .replace(/uu/g, 'uː')
      .replace(/ɑʊ/g, 'aʊ')
      .replace(/eɪ/g, 'eɪ')
      .replace(/oʊ/g, 'oʊ')
      .replace(/ɔɪ/g, 'ɔɪ')
      .replace(/kw/g, 'kw');

    return ipa.replace(/[^a-zɑæəɡʃʒŋθðtʃdʒɔɪʊʌːəroʊaɪeɪuː]/g, '') || normalized;
  }
}
