import { describe, expect, it } from "vitest";
import { getTypewriterText } from "./typewriter";

describe("getTypewriterText", () => {
  it("reveals text progressively and then returns the complete response", () => {
    expect(getTypewriterText("Hello world", 0)).toBe("");
    expect(getTypewriterText("Hello world", 5)).toBe("Hello");
    expect(getTypewriterText("Hello world", 200)).toBe("Hello world");
  });
});
