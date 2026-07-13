export type BrowserSpeechSynthesisUtterance = {
  text: string;
  lang: string;
  pitch: number;
  rate: number;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export type BrowserSpeechSynthesis = {
  speaking: boolean;
  cancel(): void;
  speak(utterance: BrowserSpeechSynthesisUtterance): void;
};

type SpeechSynthesisUtteranceConstructor = new (text: string) => BrowserSpeechSynthesisUtterance;

type SpeechSynthesisGlobal = {
  speechSynthesis?: BrowserSpeechSynthesis;
  SpeechSynthesisUtterance?: SpeechSynthesisUtteranceConstructor;
};

export function createSpeechUtterance(globalLike: SpeechSynthesisGlobal, text: string) {
  const readableText = text.trim();
  const synthesis = globalLike.speechSynthesis;
  const SpeechSynthesisUtterance = globalLike.SpeechSynthesisUtterance;

  if (!readableText || !synthesis || !SpeechSynthesisUtterance) {
    return { supported: false as const, synthesis: null, utterance: null };
  }

  const utterance = new SpeechSynthesisUtterance(readableText);
  utterance.lang = "en-US";
  utterance.pitch = 1;
  utterance.rate = 1;

  return { supported: true as const, synthesis, utterance };
}
