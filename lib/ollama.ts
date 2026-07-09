import { spawn } from "node:child_process";

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct";

// Only one model is wired up today. This is an array so the UI can render a
// dropdown and so adding more models later doesn't require a UI rewrite.
export const AVAILABLE_MODELS = [OLLAMA_MODEL];

export type OllamaStatus = {
  running: boolean;
  modelAvailable: boolean;
  modelName: string;
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
 * Whether this server process is allowed to try launching Ollama itself.
 * Deliberately conservative: only ever true for a local OLLAMA_URL outside
 * production, so a deployed instance can never be tricked into spawning a
 * process on its host machine via this endpoint.
 */
export function canAutoStartOllama() {
  return process.env.NODE_ENV !== "production" && isLocalOllamaUrl();
}

export async function getOllamaStatus(): Promise<OllamaStatus> {
  const base: Omit<OllamaStatus, "running" | "modelAvailable"> = {
    modelName: OLLAMA_MODEL,
    availableModels: AVAILABLE_MODELS,
    canAutoStart: canAutoStartOllama(),
  };

  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return { ...base, running: false, modelAvailable: false };
    }

    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const modelAvailable =
      data.models?.some((model) => model.name === OLLAMA_MODEL) ?? false;

    return { ...base, running: true, modelAvailable };
  } catch {
    return { ...base, running: false, modelAvailable: false };
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
