import { createHash } from "node:crypto";

export type PlacementRecommendation = "CREATE_NEW_DOCUMENT" | "CREATE_RELATED_DOCUMENT" | "UPDATE_EXISTING_DOCUMENT" | "DUPLICATE_SKIP";

export type PlacementCandidateInput = {
  id: string;
  title: string;
  category?: string | null;
  domain?: string | null;
  tags?: string[];
  chunkTexts?: string[];
  metadata?: unknown;
};

export type PlacementReview = {
  recommendation: PlacementRecommendation;
  confidence: number;
  summary: string;
  reasons: string[];
  candidates: Array<{
    documentId: string;
    title: string;
    score: number;
    overlapRatio: number;
    matchingSignals: string[];
  }>;
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "are",
  "because",
  "been",
  "but",
  "can",
  "for",
  "from",
  "has",
  "have",
  "into",
  "its",
  "not",
  "that",
  "the",
  "their",
  "this",
  "with",
  "you",
]);

export function createContentFingerprint(text: string) {
  return createHash("sha256").update(normalizeForFingerprint(text)).digest("hex");
}

function normalizeForFingerprint(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function metadataFingerprint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as { contentFingerprint?: unknown }).contentFingerprint;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  return new Set(tokens);
}

function overlapRatio(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let matches = 0;
  for (const token of left) {
    if (right.has(token)) matches += 1;
  }
  return matches / Math.min(left.size, right.size);
}

function sameText(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function clampConfidence(score: number) {
  return Math.max(0.1, Math.min(0.99, Number(score.toFixed(2))));
}

export function buildPlacementReview(input: {
  title: string;
  sourceText: string;
  category?: string | null;
  domain?: string | null;
  tags?: string[];
  candidates?: PlacementCandidateInput[];
}): PlacementReview {
  const candidates = input.candidates ?? [];
  const sourceFingerprint = createContentFingerprint(input.sourceText);
  const sourceTokens = tokenize(`${input.title} ${input.sourceText} ${(input.tags ?? []).join(" ")}`);

  const scoredCandidates = candidates
    .map((candidate) => {
      const candidateText = [candidate.title, candidate.category ?? "", candidate.domain ?? "", ...(candidate.tags ?? []), ...(candidate.chunkTexts ?? [])].join(" ");
      const candidateTokens = tokenize(candidateText);
      const overlap = overlapRatio(sourceTokens, candidateTokens);
      const chunkFingerprints = (candidate.chunkTexts ?? []).map(createContentFingerprint);
      const hasExactFingerprint = metadataFingerprint(candidate.metadata) === sourceFingerprint || chunkFingerprints.includes(sourceFingerprint);
      const signals: string[] = [];
      let score = overlap * 70;

      if (hasExactFingerprint) {
        score = 100;
        signals.push("Exact content fingerprint match");
      }
      if (sameText(candidate.title, input.title)) {
        score += 15;
        signals.push("Same title");
      }
      if (sameText(candidate.domain, input.domain)) {
        score += 8;
        signals.push("Same domain");
      }
      if (sameText(candidate.category, input.category)) {
        score += 6;
        signals.push("Same category");
      }

      const sharedTags = (input.tags ?? []).filter((tag) => (candidate.tags ?? []).some((candidateTag) => sameText(candidateTag, tag)));
      if (sharedTags.length > 0) {
        score += Math.min(8, sharedTags.length * 3);
        signals.push(`Shared tag${sharedTags.length === 1 ? "" : "s"}: ${sharedTags.join(", ")}`);
      }
      if (overlap >= 0.35) signals.push(`Meaningful text overlap (${Math.round(overlap * 100)}%)`);

      return {
        documentId: candidate.id,
        title: candidate.title,
        score: Math.min(100, Math.round(score)),
        overlapRatio: Number(overlap.toFixed(2)),
        matchingSignals: signals,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const best = scoredCandidates[0];
  if (!best) {
    return {
      recommendation: "CREATE_NEW_DOCUMENT",
      confidence: 0.72,
      summary: "No existing document looked similar enough, so this should be proposed as a new document.",
      reasons: ["No exact fingerprint, title, domain, tag, or text-overlap match was found among nearby documents."],
      candidates: [],
    };
  }

  if (best.matchingSignals.includes("Exact content fingerprint match")) {
    return {
      recommendation: "DUPLICATE_SKIP",
      confidence: 0.98,
      summary: `This source appears to duplicate ${best.title}.`,
      reasons: ["Exact normalized content fingerprint matched an existing document or chunk.", "Ask the user before saving another copy."],
      candidates: scoredCandidates,
    };
  }

  if (best.score >= 70 || best.overlapRatio >= 0.7) {
    return {
      recommendation: "UPDATE_EXISTING_DOCUMENT",
      confidence: clampConfidence(best.score / 100),
      summary: `This source strongly overlaps with ${best.title}; propose updating or versioning that document instead of creating a disconnected duplicate.`,
      reasons: best.matchingSignals.length > 0 ? best.matchingSignals : ["High overlap with an existing document."],
      candidates: scoredCandidates,
    };
  }

  if (best.score >= 35 || best.overlapRatio >= 0.35) {
    return {
      recommendation: "CREATE_RELATED_DOCUMENT",
      confidence: clampConfidence(best.score / 100),
      summary: `This source belongs near ${best.title}, but appears distinct enough to keep as a separate document.`,
      reasons: best.matchingSignals.length > 0 ? best.matchingSignals : ["Moderate overlap with existing knowledge."],
      candidates: scoredCandidates,
    };
  }

  return {
    recommendation: "CREATE_NEW_DOCUMENT",
    confidence: 0.68,
    summary: "The closest existing match is weak, so this should be proposed as a new document.",
    reasons: ["Only weak overlap with existing knowledge was found."],
    candidates: scoredCandidates,
  };
}

export function withContentFingerprint(metadata: unknown, sourceText: string) {
  const base = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return {
    ...base,
    contentFingerprint: createContentFingerprint(sourceText),
  };
}
