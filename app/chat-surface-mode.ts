export type ChatSurfaceMode = "booting" | "provider" | "chat";

export function getChatSurfaceMode(input: {
  bootReady: boolean;
  hasSelectedProvider: boolean;
  showProviderSetup: boolean;
}): ChatSurfaceMode {
  if (!input.bootReady) return "booting";
  if (!input.hasSelectedProvider || input.showProviderSetup) return "provider";
  return "chat";
}
