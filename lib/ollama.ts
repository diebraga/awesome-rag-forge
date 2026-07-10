import { spawn } from "node:child_process";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

// A small curated set of general-purpose instruction-following models to
// try locally. Always includes OLLAMA_MODEL (the configured default) even
// if it's a custom value. This is a fixed allowlist — the chat route and
// the pull endpoint both validate any client-supplied model name against
// it, so a request can never make the server fetch or run an arbitrary
// model name.
const CURATED_MODELS = [
  "qwen2.5:7b-instruct",
  "llama3.1:8b",
  "mistral:7b-instruct",
  "gemma2:9b",
  "phi3.5",
];

export const AVAILABLE_MODELS = Array.from(new Set([OLLAMA_MODEL, ...CURATED_MODELS]));

export function isKnownModel(model: string): boolean {
  return AVAILABLE_MODELS.includes(model);
}

export type OllamaStatus = {
  running: boolean;
  installedModels: string[];
  availableModels: string[];
  canAutoStart: boolean;
};

export function isLocalOllamaUrl(url: string = OLLAMA_URL) {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Whether this server process is allowed to try launching Ollama itself, or
 * pulling a model into it. Deliberately conservative: only ever true for a
 * local OLLAMA_URL outside production, so a deployed instance can never be
 * tricked into spawning a process or downloading a multi-gigabyte model on
 * its host machine via a visitor's request.
 */
export function canAutoStartOllama() {
  return process.env.NODE_ENV !== "production" && isLocalOllamaUrl();
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const base: Omit<OllamaStatus, "running" | "installedModels"> = {
    availableModels: AVAILABLE_MODELS,
    canAutoStart: canAutoStartOllama(),
  };

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return { ...base, running: false, installedModels: [] };
    }

    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const installedModels = (data.models ?? [])
      .map((model) => model.name)
      .filter((name): name is string => Boolean(name));

    return { ...base, running: true, installedModels };
  } catch {
    return { ...base, running: false, installedModels: [] };
  }
}

/**
 * Attempts to launch `ollama serve` on this machine. Only ever called when
 * canAutoStartOllama() is true. If Ollama is already running (e.g. as a
 * background service), the spawned process will simply fail to bind and
 * exit — that's fine, the caller polls getOllamaStatus() to see the real
 * outcome rather than trusting this function's success.
 */
export async function startOllamaLocally(): Promise<void> {
  if (!canAutoStartOllama()) {
    throw new Error(
      "Starting Ollama automatically is only available for a local OLLAMA_URL outside production.",
    );
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ollama", ["serve"], {
      detached: true,
      stdio: "ignore",
    });

    // spawn() does not throw synchronously for a missing binary — it emits
    // an "error" event (ENOENT) shortly after. Give it a brief window to
    // fail fast; otherwise assume it started (or is already running, which
    // is also a success case for our purposes — the caller confirms the
    // real outcome by polling getOllamaStatus()).
    const timer = setTimeout(() => {
      child.removeAllListeners("error");
      child.unref();
      resolve();
    }, 400);

    child.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      child.unref();
      if (error.code === "ENOENT") {
        reject(
          new Error(
            "Ollama is not installed on this machine. Install it from https://ollama.com, then try again.",
          ),
        );
      } else {
        resolve();
      }
    });
  });
}
