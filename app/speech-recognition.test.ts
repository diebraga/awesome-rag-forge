import { describe, expect, it, vi } from "vitest";
import { createSpeechRecognition, shouldRestartSpeechRecognition } from "./speech-recognition";

describe("createSpeechRecognition", () => {
  it("creates a browser speech recognizer with English input defaults", () => {
    const SpeechRecognition = vi.fn(function SpeechRecognition() {
      return {};
    });

    const recognition = createSpeechRecognition({ webkitSpeechRecognition: SpeechRecognition as never });

    expect(recognition.supported).toBe(true);
    expect(SpeechRecognition).toHaveBeenCalledTimes(1);
    expect(recognition.recognizer).toMatchObject({
      continuous: false,
      interimResults: true,
      lang: "en-US",
    });
  });

  it("reports unsupported when the browser has no speech recognition API", () => {
    const recognition = createSpeechRecognition({});

    expect(recognition).toEqual({ supported: false, recognizer: null });
  });
});

describe("shouldRestartSpeechRecognition", () => {
  it("keeps listening when the browser ends recognition during an active mic session", () => {
    expect(shouldRestartSpeechRecognition({ keepListening: true, manuallyStopped: false, hadError: false })).toBe(true);
  });

  it("stops listening when the user clicks the microphone to stop", () => {
    expect(shouldRestartSpeechRecognition({ keepListening: true, manuallyStopped: true, hadError: false })).toBe(false);
  });

  it("stops listening after a speech recognition error", () => {
    expect(shouldRestartSpeechRecognition({ keepListening: true, manuallyStopped: false, hadError: true })).toBe(false);
  });
});
