import { describe, expect, it } from "vitest";
import { getChatSurfaceMode } from "./chat-surface-mode";

describe("getChatSurfaceMode", () => {
  it("keeps the chat shell in boot mode until startup data is loaded", () => {
    expect(getChatSurfaceMode({ bootReady: false, hasSelectedProvider: false, showProviderSetup: false })).toBe("booting");
    expect(getChatSurfaceMode({ bootReady: false, hasSelectedProvider: true, showProviderSetup: false })).toBe("booting");
  });

  it("shows provider setup only after boot when no ready provider is selected", () => {
    expect(getChatSurfaceMode({ bootReady: true, hasSelectedProvider: false, showProviderSetup: false })).toBe("provider");
    expect(getChatSurfaceMode({ bootReady: true, hasSelectedProvider: true, showProviderSetup: true })).toBe("provider");
  });

  it("shows chat after boot when the selected provider can render chat", () => {
    expect(getChatSurfaceMode({ bootReady: true, hasSelectedProvider: true, showProviderSetup: false })).toBe("chat");
  });
});
