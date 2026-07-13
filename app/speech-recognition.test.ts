import { describe, expect, it, vi } from "vitest";
import { createSpeechRecognition } from "./speech-recognition";

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
