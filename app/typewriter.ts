export function getTypewriterText(text: string, visibleCharacters: number) {
  if (visibleCharacters <= 0) return "";
  if (visibleCharacters >= text.length) return text;
  return text.slice(0, visibleCharacters);
}

export function getTypewriterStep(textLength: number) {
  if (textLength > 1600) return 14;
  if (textLength > 800) return 9;
  return 5;
}
