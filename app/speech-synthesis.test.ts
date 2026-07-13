import { describe, expect, it, vi } from "vitest";
import { createSpeechUtterance } from "./speech-synthesis";

describe("createSpeechUtterance", () => {
  it("creates an English browser speech utterance for readable text", () => {
    const speechSynthesis = { cancel: vi.fn(), speak: vi.fn(), speaking: false };
    const SpeechSynthesisUtterance = vi.fn(function SpeechSynthesisUtterance(text: string) {
      return { text };
    });

    const result = createSpeechUtterance({ speechSynthesis, SpeechSynthesisUtterance: SpeechSynthesisUtterance as never }, "Hello there");

    expect(result.supported).toBe(true);
    expect(SpeechSynthesisUtterance).toHaveBeenCalledWith("Hello there");
    expect(result.utterance).toMatchObject({
      text: "Hello there",
      lang: "en-US",
      pitch: 1,
      rate: 1,
    });
  });

  it("reports unsupported when browser speech synthesis is unavailable", () => {
    const result = createSpeechUtterance({}, "Hello there");

    expect(result).toEqual({ supported: false, synthesis: null, utterance: null });
  });

  it("reports unsupported for empty text", () => {
    const speechSynthesis = { cancel: vi.fn(), speak: vi.fn(), speaking: false };
    const SpeechSynthesisUtterance = vi.fn(function SpeechSynthesisUtterance(text: string) {
      return { text };
    });

    const result = createSpeechUtterance({ speechSynthesis, SpeechSynthesisUtterance: SpeechSynthesisUtterance as never }, "   ");

    expect(result).toEqual({ supported: false, synthesis: null, utterance: null });
    expect(SpeechSynthesisUtterance).not.toHaveBeenCalled();
  });
});
