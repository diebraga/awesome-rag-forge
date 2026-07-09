"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { SendHorizontal, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatMessage = {
  id: number;
  role: "bot" | "user";
  text: string;
};

type OllamaStatusResponse = {
  ok: boolean;
  running: boolean;
  modelAvailable: boolean;
  modelName: string;
  availableModels: string[];
  canAutoStart: boolean;
};

type ConnectionState =
  | "checking"
  | "connected"
  | "disconnected"
  | "starting"
  | "not-installed"
  | "model-missing";

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "bot",
    text: "Hi. I am connected to a local model and an approved RAG knowledge base. Ask a question and I will answer using retrieved context when it is available.",
  },
];

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

  const [connectionState, setConnectionState] = useState<ConnectionState>("checking");
  const [modelName, setModelName] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [canAutoStart, setCanAutoStart] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  async function checkOllamaStatus(): Promise<OllamaStatusResponse | null> {
    try {
      const response = await fetch("/api/ollama/status");
      const data = (await response.json()) as OllamaStatusResponse;
      setModelName(data.modelName);
      setAvailableModels(data.availableModels ?? []);
      setCanAutoStart(data.canAutoStart);

      if (!data.running) {
        setConnectionState("disconnected");
      } else if (!data.modelAvailable) {
        setConnectionState("model-missing");
      } else {
        setConnectionState("connected");
      }
      return data;
    } catch {
      setConnectionState("disconnected");
      return null;
    }
  }

  useEffect(() => {
    checkOllamaStatus();
  }, []);

  async function handleConnect() {
    setConnectError(null);
    setConnectionState("starting");

    try {
      const response = await fetch("/api/ollama/start", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setConnectError(data.error ?? "Unable to start Ollama.");
        setConnectionState(
          data.error?.toLowerCase().includes("not installed")
            ? "not-installed"
            : "disconnected",
        );
        return;
      }
    } catch {
      setConnectError("Unable to reach the server to start Ollama.");
      setConnectionState("disconnected");
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
    setConnectionState("disconnected");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();
    if (!question || isLoading || connectionState !== "connected") return;

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
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = (await response.json()) as {
        reply?: string;
        error?: string;
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
        },
      ]);
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
    } finally {
      setIsLoading(false);
    }
  }

  const chatDisabled = isLoading || connectionState !== "connected";

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
            value={modelName}
            disabled={availableModels.length <= 1}
            onChange={(event) => setModelName(event.target.value)}
            className="h-9 rounded-lg border border-black/10 bg-white px-2 text-sm text-black disabled:opacity-70"
          >
            {(availableModels.length > 0 ? availableModels : [modelName])
              .filter(Boolean)
              .map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
          </select>

          <div className="flex flex-1 items-center gap-2">
            {connectionState === "checking" && (
              <span className="text-black/50">Checking Ollama...</span>
            )}
            {connectionState === "connected" && (
              <span className="text-blue-600">Connected to Ollama</span>
            )}
            {connectionState === "model-missing" && (
              <span className="text-black/60">
                Ollama is running, but{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">{modelName}</code>{" "}
                isn&apos;t pulled yet. Run{" "}
                <code className="rounded bg-black/5 px-1 py-0.5">
                  ollama pull {modelName}
                </code>
                , then reconnect.
              </span>
            )}
            {(connectionState === "disconnected" ||
              connectionState === "not-installed" ||
              connectionState === "starting") && (
              <span className="text-black/50">
                {connectionState === "starting"
                  ? "Starting Ollama..."
                  : connectionState === "not-installed"
                    ? "Ollama isn't installed on this machine."
                    : "Ollama isn't running."}
              </span>
            )}
          </div>

          {connectionState !== "connected" && connectionState !== "checking" && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={connectionState === "starting" || !canAutoStart}
              onClick={handleConnect}
            >
              {connectionState === "starting" ? "Connecting..." : "Connect to Ollama"}
            </Button>
          )}
        </div>

        {connectError && (
          <p className="shrink-0 text-xs text-black/50">
            {connectError}
            {connectionState === "not-installed" && (
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
        {!canAutoStart && connectionState !== "connected" && connectionState !== "checking" && (
          <p className="shrink-0 text-xs text-black/50">
            Auto-start isn&apos;t available for this configuration. Start Ollama
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
              connectionState === "connected"
                ? "Ask a question..."
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
