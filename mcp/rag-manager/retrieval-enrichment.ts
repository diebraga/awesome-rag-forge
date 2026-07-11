type AliasInput = {
  title?: string;
  chunkText: string;
  sectionTitle?: string;
  category?: string;
  domain?: string;
  tags?: string[];
};

const HYPERNYMS: Array<{ pattern: RegExp; aliases: string[] }> = [
  { pattern: /\bstartup\b/i, aliases: ["company", "business", "organization", "venture", "what does our startup do?", "tell me about the company"] },
  { pattern: /\bcompany\b/i, aliases: ["business", "organization", "venture", "startup", "tell me about the company"] },
  { pattern: /\bbusiness\b/i, aliases: ["company", "organization", "venture"] },
  { pattern: /\bindex\b/i, aliases: ["database", "dataset", "search index", "reference", "what is the index?"] },
  { pattern: /\bfranchise\b/i, aliases: ["franchise disclosure", "franchisee", "franchisor", "FDD"] },
];

function pushAlias(aliases: string[], value?: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return;
  if (normalized.length < 2) return;
  if (!aliases.some((alias) => alias.toLowerCase() === normalized.toLowerCase())) aliases.push(normalized);
}

function titleEntities(title?: string) {
  if (!title) return [];
  const words = title.match(/\b[A-Z][A-Za-z0-9-]{2,}\b/g) ?? [];
  return words.filter((word) => !["The", "And", "For", "With"].includes(word));
}

function textEntities(text: string) {
  const matches = text.match(/\b[A-Z][A-Za-z0-9-]{2,}\b/g) ?? [];
  return matches.filter((word) => !["The", "This", "That", "When", "Every", "Source"].includes(word));
}

export function buildRetrievalAliases(input: AliasInput): string[] {
  const aliases: string[] = [];
  const combined = [input.title, input.sectionTitle, input.chunkText, input.category, input.domain, ...(input.tags ?? [])]
    .filter(Boolean)
    .join("\n");

  for (const value of [input.domain, input.category, input.sectionTitle, ...(input.tags ?? [])]) pushAlias(aliases, value);
  for (const entity of [...titleEntities(input.title), ...textEntities(input.chunkText)].slice(0, 8)) {
    pushAlias(aliases, entity);
    pushAlias(aliases, `what is ${entity}?`);
    pushAlias(aliases, `who is ${entity}?`);
    pushAlias(aliases, `what does ${entity} do?`);
  }

  for (const { pattern, aliases: patternAliases } of HYPERNYMS) {
    if (!pattern.test(combined)) continue;
    for (const alias of patternAliases) pushAlias(aliases, alias);
  }

  return aliases.slice(0, 24);
}

export function retrievalTextForEmbedding(chunkText: string, retrievalAliases: string[]): string {
  const aliases = retrievalAliases.map((alias) => alias.trim()).filter(Boolean);
  return aliases.length > 0 ? `${chunkText}\n\nRetrieval aliases: ${aliases.join("; ")}` : chunkText;
}

export function withRetrievalAliases(metadata: unknown, retrievalAliases: string[]) {
  const existing = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return {
    ...existing,
    retrievalAliases: Array.from(new Set(retrievalAliases.map((alias) => alias.trim()).filter(Boolean))),
  };
}

export function getRetrievalAliases(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const aliases = (metadata as { retrievalAliases?: unknown }).retrievalAliases;
  if (!Array.isArray(aliases)) return [];
  return aliases.filter((alias): alias is string => typeof alias === "string" && alias.trim().length > 0);
}
