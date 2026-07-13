export type SpeechRecognitionAlternativeLike = {
  transcript?: string;
};

export type SpeechRecognitionResultLike = {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  [index: number]: SpeechRecognitionAlternativeLike;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    readonly length: number;
    item(index: number): SpeechRecognitionResultLike;
    [index: number]: SpeechRecognitionResultLike;
  };
};

export type SpeechRecognitionErrorEventLike = {
  error?: string;
};

export type BrowserSpeechRecognizer = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognizer;

type SpeechRecognitionGlobal = {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export function createSpeechRecognition(globalLike: SpeechRecognitionGlobal) {
  const SpeechRecognition = globalLike.SpeechRecognition ?? globalLike.webkitSpeechRecognition;

  if (!SpeechRecognition) return { supported: false as const, recognizer: null };

  const recognizer = new SpeechRecognition();
  recognizer.continuous = false;
  recognizer.interimResults = true;
  recognizer.lang = "en-US";

  return { supported: true as const, recognizer };
}

export function getSpeechTranscript(event: SpeechRecognitionEventLike) {
  const parts: string[] = [];

  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index] ?? event.results.item(index);
    const alternative = result?.[0] ?? result?.item(0);
    const transcript = alternative?.transcript?.trim();
    if (transcript) parts.push(transcript);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function describeSpeechRecognitionError(error?: string) {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Microphone permission was blocked. Allow microphone access and try again.";
  }
  if (error === "no-speech") return "I did not catch any speech. Try again or type your message.";
  if (error === "audio-capture") return "No microphone was found on this device.";
  if (error === "network") return "Voice input could not reach the browser speech service.";
  return "Voice input stopped. Type your message or try the microphone again.";
}

export function shouldRestartSpeechRecognition(input: { keepListening: boolean; manuallyStopped: boolean; hadError: boolean }) {
  return input.keepListening && !input.manuallyStopped && !input.hadError;
}
