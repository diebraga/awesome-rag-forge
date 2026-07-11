export type ChatQueryMessage = {
  role: "bot" | "user";
  text: string;
};

export function getLatestUserQuestion(messages: ChatQueryMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = message.text.trim();
    if (text) return text;
  }

  return undefined;
}
