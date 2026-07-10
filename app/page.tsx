"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, SendHorizontal, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatSource = {
  documentId: string;
  title: string;
  downloadable: boolean;
};

type ChatMessage = {
  id: number;
  role: "bot" | "user";
  text: string;
  sources?: ChatSource[];
  question?: string;
  isGreeting?: boolean;
};

type FeedbackRating = "GOOD" | "BAD";

type OllamaStatusResponse = {
  ok: boolean;
  running: boolean;
  installedModels: string[];
  availableModels: string[];
  canAutoStart: boolean;
};

type ServerStatus = "checking" | "connected" | "disconnected" | "starting" | "not-installed";
type PullState = "idle" | "pulling" | "error";

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "bot",
    text: "Hi. I am connected to a local model and an approved RAG knowledge base. Ask a question and I will answer using retrieved context when it is available.",
    isGreeting: true,
  },
];

function describePullStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("verifying")) return "Verifying download";
  if (normalized.includes("writing manifest")) return "Finalizing";
  if (normalized.includes("removing")) return "Cleaning up";
  if (normalized === "success") return "Finishing up";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function PersonAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-black">
      <User className="size-4" />
    </div>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [serverStatus, setServerStatus] = useState<ServerStatus>("checking");
  const [installedModels, setInstalledModels] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [canAutoStart, setCanAutoStart] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const [pullState, setPullState] = useState<PullState>("idle");
  const [pullProgress, setPullProgress] = useState<number | null>(null);
  const [pullPhase, setPullPhase] = useState<"downloading" | "finalizing">("downloading");
  const [pullStatusText, setPullStatusText] = useState<string | null>(null);
  const [pullError, setPullError] = useState<string | null>(null);

  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<number, FeedbackRating>>({});
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function checkOllamaStatus(): Promise<OllamaStatusResponse | null> {
    try {
      const response = await fetch("/api/ollama/status");
      const data = (await response.json()) as OllamaStatusResponse;
      setInstalledModels(data.installedModels ?? []);
      setAvailableModels(data.availableModels ?? []);
      setCanAutoStart(data.canAutoStart);
      setSelectedModel((current) => current || data.availableModels?.[0] || "");
      setServerStatus(data.running ? "connected" : "disconnected");
      return data;
    } catch {
      setServerStatus("disconnected");
      return null;
    }
  }

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  async function handleConnect() {
    setConnectError(null);
    setServerStatus("starting");

    try {
      const response = await fetch("/api/ollama/start", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setConnectError(data.error ?? "Unable to start Ollama.");
        setServerStatus(
          data.error?.toLowerCase().includes("not installed") ? "not-installed" : "disconnected",
        );
        return;
      }
    } catch {
      setConnectError("Unable to reach the server to start Ollama.");
      setServerStatus("disconnected");
      return;
    }

    for (let attempt = 0; attempt < 15; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const status = await checkOllamaStatus();
      if (status?.running) return;
    }

    setConnectError(
      "Ollama did not respond in time. It may still be starting — try Connect again in a moment.",
    );
    setServerStatus("disconnected");
  }

  async function handleDownloadModel() {
    if (!selectedModel) return;
    setPullState("pulling");
    setPullError(null);
    setPullProgress(null);
    setPullPhase("downloading");
    setPullStatusText(null);

    try {
      const response = await fetch("/api/ollama/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setPullError(data?.error ?? "Unable to start the download.");
        setPullState("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              status?: string;
              error?: string;
              completed?: number;
              total?: number;
            };
            if (event.error) {
              setPullError(event.error);
              setPullState("error");
              return;
            }
            if (event.total && event.completed) {
              setPullPhase("downloading");
              setPullProgress(Math.round((event.completed / event.total) * 100));
            } else if (event.status) {
              // Byte progress has stopped arriving — Ollama has moved on to
              // verifying/writing the manifest. Show that instead of
              // leaving a stale percentage on screen with no explanation.
              setPullPhase("finalizing");
              setPullStatusText(event.status);
            }
          } catch {
            // Ignore a malformed/partial line — the next chunk will complete it.
          }
        }
      }

      setPullState("idle");
      setPullProgress(null);
      await checkOllamaStatus();
    } catch {
      setPullError("Download interrupted. Try again.");
      setPullState("error");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();
    const modelReady = installedModels.includes(selectedModel);
    if (!question || isLoading || serverStatus !== "connected" || !modelReady) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: question,
    };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages: nextMessages, model: selectedModel }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
        sources?: ChatSource[];
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now() + 1,
          role: "bot",
          text:
            data.reply ??
            data.error ??
            "The local model did not return a response.",
          sources: data.reply ? data.sources : undefined,
          question: data.reply ? question : undefined,
        },
      ]);

      if (!response.ok) {
        // The backend couldn't reach Ollama — re-check so the status strip
        // reflects reality instead of still claiming "Connected."
        checkOllamaStatus();
      }
    } catch (error) {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: Date.now() + 1,
          role: "bot",
          text:
            error instanceof Error
              ? error.message
              : "Unable to reach the local model.",
        },
      ]);
      checkOllamaStatus();
    } finally {
      setIsLoading(false);
    }
  }

  async function submitFeedback(message: ChatMessage, rating: FeedbackRating) {
    setFeedbackByMessage((current) => ({ ...current, [message.id]: rating }));
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: message.question,
          answer: message.text,
          rating,
          documentIds: message.sources?.map((source) => source.documentId),
        }),
      });
    } catch {
      // Best-effort — feedback isn't on the critical path, so a failed
      // submission shouldn't interrupt or alarm the user.
    }
  }

  async function copyMessageText(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current));
      }, 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context) — silently
      // no-op rather than showing an error for a non-critical convenience.
    }
  }

  const modelReady = installedModels.includes(selectedModel);
  const chatDisabled = isLoading || serverStatus !== "connected" || !modelReady;

  return (
    <main className="flex h-full flex-col bg-white px-4 py-6 text-black">
      <section className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4">
        <header className="shrink-0 space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-blue-600">
            Read-only knowledge base viewer
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-black">
            Test your RAG knowledge base
          </h1>
          <p className="text-sm leading-6 text-black/60">
            This chat searches and answers using only the approved knowledge
            base. Use it to verify that retrieval is working and see what the
            knowledge base currently contains. It cannot add, edit, approve,
            or delete knowledge — those actions happen exclusively through
            the MCP server&apos;s proposal-and-approval workflow.
          </p>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-sm">
          <label className="sr-only" htmlFor="model">
            Model
          </label>
          <select
            id="model"
            value={selectedModel}
            disabled={availableModels.length === 0 || pullState === "pulling"}
            onChange={(event) => setSelectedModel(event.target.value)}
            className="h-9 rounded-lg border border-black/10 bg-white px-2 text-sm text-black disabled:opacity-70"
          >
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
                {installedModels.includes(model) ? "" : " (not downloaded)"}
              </option>
            ))}
          </select>

          <div className="flex flex-1 items-center gap-2">
            {serverStatus === "checking" && (
              <span className="text-black/50">Checking Ollama...</span>
            )}
            {serverStatus === "connected" && modelReady && (
              <span className="text-blue-600">Connected to Ollama</span>
            )}
            {serverStatus === "connected" && !modelReady && pullState !== "pulling" && (
              <span className="text-black/60">
                <code className="rounded bg-black/5 px-1 py-0.5">{selectedModel}</code>{" "}
                isn&apos;t downloaded yet.
              </span>
            )}
            {serverStatus === "connected" && pullState === "pulling" && (
              <span className="text-black/60">
                {pullPhase === "downloading"
                  ? `Downloading ${selectedModel}${pullProgress !== null ? ` — ${pullProgress}%` : "..."}`
                  : `${selectedModel}: ${pullStatusText ? describePullStatus(pullStatusText) : "Finalizing"}...`}
              </span>
            )}
            {(serverStatus === "disconnected" ||
              serverStatus === "not-installed" ||
              serverStatus === "starting") && (
              <span className="text-black/50">
                {serverStatus === "starting"
                  ? "Starting Ollama..."
                  : serverStatus === "not-installed"
                    ? "Ollama isn't installed on this machine."
                    : "Ollama isn't running."}
              </span>
            )}
          </div>

          {serverStatus !== "connected" && serverStatus !== "checking" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={serverStatus === "starting" || !canAutoStart}
              onClick={handleConnect}
            >
              {serverStatus === "starting" ? "Connecting..." : "Connect to Ollama"}
            </Button>
          )}

          {serverStatus === "connected" && !modelReady && canAutoStart && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={pullState === "pulling"}
              onClick={handleDownloadModel}
            >
              {pullState === "pulling" ? "Downloading..." : "Download model"}
            </Button>
          )}
        </div>

        {connectError && (
          <p className="shrink-0 text-xs text-black/50">
            {connectError}
            {serverStatus === "not-installed" && (
              <>
                {" "}
                Get it from{" "}
                <a
                  href="https://ollama.com"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline underline-offset-2"
                >
                  ollama.com
                </a>
                .
              </>
            )}
          </p>
        )}
        {pullError && <p className="shrink-0 text-xs text-black/50">{pullError}</p>}
        {!canAutoStart && serverStatus !== "connected" && serverStatus !== "checking" && (
          <p className="shrink-0 text-xs text-black/50">
            Auto-start isn&apos;t available for this configuration. Start Ollama
            yourself, then refresh this page.
          </p>
        )}
        {serverStatus === "connected" && !modelReady && !canAutoStart && (
          <p className="shrink-0 text-xs text-black/50">
            Auto-download isn&apos;t available for this configuration. Run{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">ollama pull {selectedModel}</code>{" "}
            yourself, then refresh this page.
          </p>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 py-1 pr-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-end gap-3 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "bot" && <PersonAvatar />}
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
                      : "max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-muted px-4 py-3 text-sm leading-6 text-foreground"
                  }
                >
                  {message.text}
                  {message.sources?.some((source) => source.downloadable) && (
                    <div className="mt-2 flex flex-wrap gap-2 whitespace-normal">
                      {message.sources
                        .filter((source) => source.downloadable)
                        .map((source) => (
                          <a
                            key={source.documentId}
                            href={`/api/rag/documents/${source.documentId}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50"
                          >
                            <Download className="size-3" />
                            {source.title}
                          </a>
                        ))}
                    </div>
                  )}
                  {message.role === "bot" && !message.isGreeting && (
                    <div className="mt-2 flex items-center gap-1 whitespace-normal">
                      <button
                        type="button"
                        onClick={() => copyMessageText(message)}
                        aria-label="Copy message"
                        className="inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"
                      >
                        {copiedMessageId === message.id ? (
                          <Check className="size-3.5" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => submitFeedback(message, "GOOD")}
                        aria-label="Good response"
                        className={
                          feedbackByMessage[message.id] === "GOOD"
                            ? "inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600"
                            : "inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"
                        }
                      >
                        <ThumbsUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => submitFeedback(message, "BAD")}
                        aria-label="Bad response"
                        className={
                          feedbackByMessage[message.id] === "BAD"
                            ? "inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600"
                            : "inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"
                        }
                      >
                        <ThumbsDown className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {message.role === "user" && <PersonAvatar />}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-end gap-3">
                <PersonAvatar />
                <div className="max-w-[82%] rounded-2xl rounded-bl-md border bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <form onSubmit={handleSubmit} className="flex w-full shrink-0 gap-3">
          <label className="sr-only" htmlFor="message">
            Message
          </label>
          <Input
            id="message"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              serverStatus === "connected" && modelReady
                ? "Ask a question..."
                : serverStatus === "connected"
                  ? "Download the selected model to start chatting"
                  : "Connect to Ollama to start chatting"
            }
            className="h-12 flex-1 rounded-xl bg-white px-4"
            disabled={chatDisabled}
          />
          <Button
            type="submit"
            size="lg"
            className="h-12 rounded-xl px-5"
            disabled={chatDisabled}
          >
            {isLoading ? "Wait" : "Send"}
            <SendHorizontal data-icon="inline-end" className="size-4" />
          </Button>
        </form>
      </section>
    </main>
  );
}
