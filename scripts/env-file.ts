// Pure, unit-testable .env editing — no I/O here, so setup-env.ts stays a
// thin interactive wrapper around this.
export function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}="${value}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const separator = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  return `${content}${separator}${line}\n`;
}
