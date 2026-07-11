import { describe, expect, it } from "vitest";
import { getLatestUserQuestion } from "./chat-query";

describe("getLatestUserQuestion", () => {
  it("returns the latest non-empty user message", () => {
    expect(
      getLatestUserQuestion([
        { role: "user", text: "What is the project?" },
        { role: "bot", text: "Answer" },
        { role: "user", text: "  What is COEse?  " },
      ]),
    ).toBe("What is COEse?");
  });

  it("returns undefined when there is no user question", () => {
    expect(getLatestUserQuestion([{ role: "bot", text: "Hi" }])).toBeUndefined();
  });
});
