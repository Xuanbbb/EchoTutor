import { CmudictService } from './CmudictService';

const IPA = {
  schwa: '\u0259',
  ae: '\u00e6',
  openBack: '\u0251',
  openMidBack: '\u0254',
  wedge: '\u028c',
  eng: '\u014b',
  esh: '\u0283',
  ezh: '\u0292',
  theta: '\u03b8',
  eth: '\u00f0',
  tesh: 't\u0283',
  dezh: 'd\u0292',
  rhotic: '\u025d',
  rhoticSchwa: '\u0259r',
  barredI: '\u026a',
  smallCapitalI: '\u026a',
  smallCapitalU: '\u028a',
  length: '\u02d0',
  stress: '\u02c8',
} as const;

const IRREGULAR_IPA: Record<string, string> = {
  a: IPA.schwa,
  an: `${IPA.ae}n`,
  are: `${IPA.openBack}r`,
  be: `bi${IPA.length}`,
  bread: 'bred',
  comfortable: `${IPA.stress}k${IPA.wedge}mft${IPA.schwa}b${IPA.schwa}l`,
  could: `k${IPA.smallCapitalU}d`,
  do: `du${IPA.length}`,
  done: `d${IPA.wedge}n`,
  english: `${IPA.stress}${IPA.smallCapitalI}${IPA.eng}\u0261l${IPA.smallCapitalI}${IPA.esh}`,
  every: `${IPA.stress}evri`,
  good: `\u0261${IPA.smallCapitalU}d`,
  have: `h${IPA.ae}v`,
  heard: `h${IPA.rhotic}d`,
  height: 'ha\u026at',
  hour: `a${IPA.smallCapitalU}${IPA.schwa}r`,
  idea: `a\u026a${IPA.stress}di${IPA.length}${IPA.schwa}`,
  is: `${IPA.smallCapitalI}z`,
  language: `${IPA.stress}l${IPA.ae}${IPA.eng}\u0261w${IPA.smallCapitalI}d${IPA.dezh}`,
  learn: `l${IPA.rhotic}n`,
  of: `${IPA.schwa}v`,
  often: `${IPA.stress}${IPA.openMidBack}f${IPA.schwa}n`,
  one: `w${IPA.wedge}n`,
  people: `${IPA.stress}pi${IPA.length}p${IPA.schwa}l`,
  probably: `${IPA.stress}pr${IPA.openBack}b${IPA.schwa}bli`,
  question: `${IPA.stress}kwest${IPA.esh}${IPA.schwa}n`,
  read: `ri${IPA.length}d`,
  said: 'sed',
  should: `${IPA.esh}${IPA.smallCapitalU}d`,
  speak: `spi${IPA.length}k`,
  sure: `${IPA.esh}${IPA.smallCapitalU}r`,
  the: `${IPA.eth}${IPA.schwa}`,
  their: `${IPA.eth}er`,
  there: `${IPA.eth}er`,
  they: `${IPA.eth}e\u026a`,
  through: `${IPA.theta}ru${IPA.length}`,
  to: `tu${IPA.length}`,
  was: `w${IPA.wedge}z`,
  were: `w${IPA.rhotic}`,
  what: `w${IPA.wedge}t`,
  where: 'wer',
  who: `hu${IPA.length}`,
  whole: 'ho\u028al',
  would: `w${IPA.smallCapitalU}d`,
  you: `ju${IPA.length}`,
  your: `j${IPA.smallCapitalU}r`,
};

const ARPABET_TO_IPA: Record<string, string> = {
  AA: IPA.openBack,
  AE: IPA.ae,
  AH: IPA.wedge,
  AO: IPA.openMidBack,
  AW: `a${IPA.smallCapitalU}`,
  AY: 'a\u026a',
  B: 'b',
  CH: IPA.tesh,
  D: 'd',
  DH: IPA.eth,
  EH: 'e',
  ER: IPA.rhotic,
  EY: 'e\u026a',
  F: 'f',
  G: '\u0261',
  HH: 'h',
  IH: IPA.smallCapitalI,
  IY: `i${IPA.length}`,
  JH: IPA.dezh,
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: IPA.eng,
  OW: 'o\u028a',
  OY: `${IPA.openMidBack}\u026a`,
  P: 'p',
  R: 'r',
  S: 's',
  SH: IPA.esh,
  T: 't',
  TH: IPA.theta,
  UH: IPA.smallCapitalU,
  UW: `u${IPA.length}`,
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: IPA.ezh,
};

const STRESSED_ARPABET_TO_IPA: Record<string, string> = {
  AH0: IPA.schwa,
  AH1: IPA.wedge,
  AH2: IPA.wedge,
  ER0: IPA.rhoticSchwa,
  ER1: IPA.rhotic,
  ER2: IPA.rhotic,
  IH0: IPA.schwa,
  IY0: 'i',
  UW0: 'u',
};

const normalizeWord = (word: string) => word.toLowerCase().replace(/[^a-z']/g, '');
const replaceOnce = (value: string, pattern: RegExp, replacement: string) => value.replace(pattern, replacement);

export class PronunciationGuideService {
  private readonly cmudictService = new CmudictService();

  toIpa(word: string): string {
    const normalized = normalizeWord(word);
    if (!normalized) {
      return '';
    }

    const dictPronunciation = this.cmudictService.lookup(normalized);
    if (dictPronunciation) {
      const ipa = this.fromArpabet(dictPronunciation);
      if (ipa) {
        return ipa;
      }
    }

    const irregular = IRREGULAR_IPA[normalized];
    if (irregular) {
      return irregular;
    }

    return this.toFallbackIpa(normalized);
  }

  private fromArpabet(tokens: string[]): string {
    return tokens
      .map((token) => STRESSED_ARPABET_TO_IPA[token] || ARPABET_TO_IPA[token.replace(/[0-2]/g, '')] || '')
      .filter(Boolean)
      .join('');
  }

  private toFallbackIpa(normalized: string): string {
    let ipa = normalized;

    ipa = replaceOnce(ipa, /^x/, 'z');
    ipa = ipa.replace(/tion/g, `${IPA.esh}${IPA.schwa}n`);
    ipa = ipa.replace(/sion/g, `${IPA.ezh}${IPA.schwa}n`);
    ipa = ipa.replace(/ture/g, `${IPA.tesh}${IPA.schwa}r`);
    ipa = ipa.replace(/ough/g, 'o\u028a');
    ipa = ipa.replace(/eigh/g, 'e\u026a');
    ipa = ipa.replace(/igh/g, 'a\u026a');
    ipa = ipa.replace(/ph/g, 'f');
    ipa = ipa.replace(/sh/g, IPA.esh);
    ipa = ipa.replace(/ch/g, IPA.tesh);
    ipa = ipa.replace(/th/g, IPA.theta);
    ipa = ipa.replace(/wh/g, 'w');
    ipa = ipa.replace(/ck/g, 'k');
    ipa = ipa.replace(/qu/g, 'kw');
    ipa = ipa.replace(/ng/g, IPA.eng);
    ipa = ipa.replace(/ee/g, `i${IPA.length}`);
    ipa = ipa.replace(/ea/g, `i${IPA.length}`);
    ipa = ipa.replace(/oo/g, `u${IPA.length}`);
    ipa = ipa.replace(/ou/g, `a${IPA.smallCapitalU}`);
    ipa = ipa.replace(/ow/g, 'o\u028a');
    ipa = ipa.replace(/oi/g, `${IPA.openMidBack}\u026a`);
    ipa = ipa.replace(/oy/g, `${IPA.openMidBack}\u026a`);
    ipa = ipa.replace(/ai/g, 'e\u026a');
    ipa = ipa.replace(/ay/g, 'e\u026a');
    ipa = ipa.replace(/oa/g, 'o\u028a');
    ipa = ipa.replace(/au/g, IPA.openMidBack);
    ipa = ipa.replace(/er\b/g, IPA.rhoticSchwa);
    ipa = ipa.replace(/ir\b/g, IPA.rhoticSchwa);
    ipa = ipa.replace(/ur\b/g, IPA.rhoticSchwa);
    ipa = ipa.replace(/ar/g, `${IPA.openBack}r`);
    ipa = ipa.replace(/or/g, `${IPA.openMidBack}r`);
    ipa = ipa.replace(/a\b/g, IPA.schwa);
    ipa = ipa.replace(/e\b/g, '');
    ipa = ipa.replace(/i\b/g, 'a\u026a');
    ipa = ipa.replace(/o\b/g, 'o\u028a');
    ipa = ipa.replace(/u\b/g, `ju${IPA.length}`);

    ipa = ipa
      .replace(/a/g, IPA.ae)
      .replace(/b/g, 'b')
      .replace(/c/g, 'k')
      .replace(/d/g, 'd')
      .replace(/e/g, 'e')
      .replace(/f/g, 'f')
      .replace(/g/g, '\u0261')
      .replace(/h/g, 'h')
      .replace(/i/g, IPA.smallCapitalI)
      .replace(/j/g, IPA.dezh)
      .replace(/k/g, 'k')
      .replace(/l/g, 'l')
      .replace(/m/g, 'm')
      .replace(/n/g, 'n')
      .replace(/o/g, IPA.openBack)
      .replace(/p/g, 'p')
      .replace(/r/g, 'r')
      .replace(/s/g, 's')
      .replace(/t/g, 't')
      .replace(/u/g, IPA.wedge)
      .replace(/v/g, 'v')
      .replace(/w/g, 'w')
      .replace(/x/g, 'ks')
      .replace(/y/g, 'j')
      .replace(/z/g, 'z');

    ipa = ipa
      .replace(new RegExp(`${IPA.schwa}${IPA.rhoticSchwa}`, 'g'), IPA.rhoticSchwa)
      .replace(/ii/g, `i${IPA.length}`)
      .replace(/uu/g, `u${IPA.length}`)
      .replace(new RegExp(`${IPA.openBack}${IPA.smallCapitalU}`, 'g'), `a${IPA.smallCapitalU}`)
      .replace(/eɪ/g, 'e\u026a')
      .replace(/oʊ/g, 'o\u028a')
      .replace(new RegExp(`${IPA.openMidBack}\u026a`, 'g'), `${IPA.openMidBack}\u026a`)
      .replace(/kw/g, 'kw');

    return ipa;
  }
}
