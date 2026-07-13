
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, MessageCircleQuestion, Mic, SendHorizontal, Square, ThumbsDown, ThumbsUp, User, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testingFetch } from "@/lib/testing-api-client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { describeSpeechRecognitionError, getSpeechTranscript, createSpeechRecognition, shouldRestartSpeechRecognition, type BrowserSpeechRecognizer } from "./speech-recognition";
import { createSpeechUtterance } from "./speech-synthesis";
import { getChatSurfaceMode } from "./chat-surface-mode";
import { getTypewriterStep, getTypewriterText } from "./typewriter";

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
  animate?: boolean;
  isPending?: boolean;
};

type FeedbackRating = "GOOD" | "BAD";

type ProviderStatus = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  configured: boolean;
  defaultModel: string;
  models: string[];
  envVar?: string;
};

type OllamaStatusResponse = {
  ok: boolean;
  running: boolean;
  installedModels: string[];
  availableModels: string[];
  canAutoStart: boolean;
};

type ServerStatus = "checking" | "connected" | "disconnected" | "starting" | "installing" | "not-installed";
type PullState = "idle" | "pulling" | "error";

const PROVIDER_CACHE_KEY = "awesome-rag-forge:selected-provider";

function buildInitialMessages(name: string): ChatMessage[] {
  return [
    {
      id: 1,
      role: "bot",
      text: `Hi. I am ${name}, connected to the approved RAG knowledge base. Ask a question and I will answer using retrieved context when it is available.`,
      isGreeting: true,
    },
  ];
}

function describePullStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("verifying")) return "Verifying download";
  if (normalized.includes("writing manifest")) return "Finalizing";
  if (normalized.includes("removing")) return "Cleaning up";
  if (normalized === "success") return "Finishing up";
  return status.charAt(0).toUpperCase() + status.slice(1);
}


function ThinkingBubble() {
  return (
    <div className="flex min-h-11 items-center gap-2 rounded-2xl rounded-bl-md border bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
      <span className="sr-only">Thinking</span>
      <span className="inline-flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-current" />
      </span>
    </div>
  );
}

function PendingAssistantBubble() {
  return (
    <div className="min-h-24 w-full max-w-[82%] rounded-2xl rounded-bl-md border bg-muted px-4 py-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="sr-only">Preparing response</span>
        <span className="inline-flex items-center gap-1" aria-hidden="true">
          <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-current" />
        </span>
      </div>
      <div className="mt-3 space-y-2" aria-hidden="true">
        <Skeleton className="h-3 w-11/12 bg-black/10" />
        <Skeleton className="h-3 w-4/5 bg-black/10" />
        <Skeleton className="h-3 w-2/3 bg-black/10" />
      </div>
    </div>
  );
}

function PersonAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-black">
      <User className="size-4" />
    </div>
  );
}

function ChatBootSkeleton() {
  return (
    <main className="flex h-full flex-col bg-white px-4 py-6 text-black">
      <section className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4">
        <header className="shrink-0 space-y-1.5">
          <Skeleton className="h-3 w-40 bg-black/10" />
          <Skeleton className="h-6 w-56 bg-black/10" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full bg-black/10" />
            <Skeleton className="h-4 w-4/5 bg-black/10" />
          </div>
        </header>

        <div className="flex min-h-[62px] shrink-0 items-center gap-3 rounded-xl border border-black/10 px-4 py-3">
          <Skeleton className="h-9 w-36 rounded-lg bg-black/10" />
          <Skeleton className="h-4 flex-1 bg-black/10" />
          <Skeleton className="h-8 w-24 rounded-lg bg-black/10" />
        </div>

        <div className="min-h-0 flex-1 space-y-4 py-1 pr-2">
          <div className="flex items-end gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full bg-black/10" />
            <div className="min-h-24 w-full max-w-[82%] rounded-2xl rounded-bl-md border bg-muted px-4 py-3">
              <Skeleton className="h-3 w-11/12 bg-black/10" />
              <Skeleton className="mt-2 h-3 w-4/5 bg-black/10" />
              <Skeleton className="mt-2 h-3 w-2/3 bg-black/10" />
            </div>
          </div>
        </div>

        <div className="flex min-h-[60px] w-full shrink-0 items-center gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          <Skeleton className="h-11 flex-1 rounded-xl bg-black/10" />
          <Skeleton className="size-11 rounded-xl bg-black/10" />
          <Skeleton className="size-11 rounded-xl bg-black/10" />
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [assistantName, setAssistantName] = useState("this assistant");
  const [messages, setMessages] = useState<ChatMessage[]>(() => buildInitialMessages("this assistant"));
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [assistantNameLoaded, setAssistantNameLoaded] = useState(false);
  const [ollamaStatusLoaded, setOllamaStatusLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognizer | null>(null);
  const keepListeningRef = useRef(false);
  const manuallyStoppedListeningRef = useRef(false);
  const speechHadErrorRef = useRef(false);
  const speechRestartTimerRef = useRef<number | null>(null);

  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [setupPrompt, setSetupPrompt] = useState<string | null>(null);
  const [copiedSetupPrompt, setCopiedSetupPrompt] = useState(false);

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
  const [visibleMessageChars, setVisibleMessageChars] = useState<Record<number, number>>({});

  const selectedProvider = providers.find((provider) => provider.id === selectedProviderId) ?? null;
  const selectedProviderModels = selectedProvider?.id === "ollama" ? availableModels : selectedProvider?.models ?? [];
  const modelReady = selectedProvider?.id === "ollama" ? installedModels.includes(selectedModel) : Boolean(selectedProvider?.configured);
  const providerReady = selectedProvider?.id === "ollama" ? serverStatus === "connected" && modelReady : Boolean(selectedProvider?.configured);
  const showProviderSetup = Boolean(selectedProvider && selectedProvider.id !== "ollama" && !selectedProvider.configured);
  const bootReady = providersLoaded && assistantNameLoaded && ollamaStatusLoaded;
  const surfaceMode = getChatSurfaceMode({
    bootReady,
    hasSelectedProvider: Boolean(selectedProvider),
    showProviderSetup,
  });
  const chatDisabled = isLoading || !providerReady;
  const hasPendingAssistantMessage = messages.some((message) => message.isPending);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const activeMessage = [...messages]
      .reverse()
      .find((message) => message.role === "bot" && message.animate && (visibleMessageChars[message.id] ?? 0) < message.text.length);

    if (!activeMessage) return;

    const timer = window.setTimeout(() => {
      setVisibleMessageChars((current) => ({
        ...current,
        [activeMessage.id]: Math.min(activeMessage.text.length, (current[activeMessage.id] ?? 0) + getTypewriterStep(activeMessage.text.length)),
      }));
    }, 18);

    return () => window.clearTimeout(timer);
  }, [messages, visibleMessageChars]);


  async function refreshAssistantName() {
    try {
      const response = await testingFetch("/api/rag/harness");
      if (!response.ok) return;
      const data = (await response.json()) as { name?: string };
      const nextName = data.name;
      if (!nextName) return;
      setAssistantName(nextName);
      setMessages((current) =>
        current.length === 1 && current[0]?.isGreeting ? buildInitialMessages(nextName) : current,
      );
    } catch {
      // The database/setup readiness screens already handle unavailable state.
    } finally {
      setAssistantNameLoaded(true);
    }
  }

  async function refreshProviders() {
    try {
      const response = await testingFetch("/api/chat/providers");
      if (!response.ok) return;
      const data = (await response.json()) as { providers?: ProviderStatus[] };
      const nextProviders = data.providers ?? [];
      setProviders(nextProviders);

      const cachedProvider = window.localStorage.getItem(PROVIDER_CACHE_KEY);
      const matchingProvider = nextProviders.find((provider) => provider.id === cachedProvider);
      if (matchingProvider) {
        setSelectedProviderId(matchingProvider.id);
        setSelectedModel((current) => current || matchingProvider.defaultModel);
      }
    } catch {
      // Keep the chooser empty; API readiness banners handle auth/setup errors.
    } finally {
      setProvidersLoaded(true);
    }
  }

  useEffect(() => {
    refreshProviders();
    refreshAssistantName();
    checkOllamaStatus();
    const interval = window.setInterval(refreshAssistantName, 15000);
    window.addEventListener("focus", refreshAssistantName);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshAssistantName);
      keepListeningRef.current = false;
      if (speechRestartTimerRef.current !== null) window.clearTimeout(speechRestartTimerRef.current);
      speechRecognitionRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (selectedProvider && !selectedModel) setSelectedModel(selectedProvider.defaultModel);
  }, [selectedProvider, selectedModel]);

  async function checkOllamaStatus(): Promise<OllamaStatusResponse | null> {
    try {
      const response = await testingFetch("/api/ollama/status");
      const data = (await response.json()) as OllamaStatusResponse;
      setInstalledModels(data.installedModels ?? []);
      setAvailableModels(data.availableModels ?? []);
      setCanAutoStart(data.canAutoStart);
      setSelectedModel((current) => current || data.availableModels?.[0] || "");
      setServerStatus(data.running ? "connected" : "disconnected");
      setOllamaStatusLoaded(true);
      return data;
    } catch {
      setServerStatus("disconnected");
      setOllamaStatusLoaded(true);
      return null;
    }
  }

  async function selectProvider(provider: ProviderStatus) {
    window.localStorage.setItem(PROVIDER_CACHE_KEY, provider.id);
    setSelectedProviderId(provider.id);
    setSelectedModel(provider.defaultModel);
    setSetupPrompt(null);
    setCopiedSetupPrompt(false);

    if (provider.id !== "ollama" && !provider.configured) {
      const response = await testingFetch("/api/chat/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      const data = (await response.json()) as { prompt?: string };
      setSetupPrompt(data.prompt ?? `Add ${provider.envVar} to .env, restart the dev server, then reload this page.`);
    }
  }

  function changeProvider() {
    window.localStorage.removeItem(PROVIDER_CACHE_KEY);
    setSelectedProviderId(null);
    setSetupPrompt(null);
  }

  async function copySetupPrompt() {
    if (!setupPrompt) return;
    await navigator.clipboard.writeText(setupPrompt);
    setCopiedSetupPrompt(true);
    setTimeout(() => setCopiedSetupPrompt(false), 1500);
  }

  async function handleInstallOllama() {
    setConnectError(null);
    setServerStatus("installing");
    try {
      const response = await testingFetch("/api/ollama/install", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setConnectError(data.error ?? "Unable to install Ollama.");
        setServerStatus("not-installed");
        return;
      }
      await handleConnect();
    } catch {
      setConnectError("Unable to reach the server to install Ollama.");
      setServerStatus("not-installed");
    }
  }

  async function handleConnect() {
    setConnectError(null);
    setServerStatus("starting");

    try {
      const response = await testingFetch("/api/ollama/start", { method: "POST" });
      const data = (await response.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setConnectError(data.error ?? "Unable to start Ollama.");
        setServerStatus(data.error?.toLowerCase().includes("not installed") ? "not-installed" : "disconnected");
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

    setConnectError("Ollama did not respond in time. It may still be starting — try Connect again in a moment.");
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
      const response = await testingFetch("/api/ollama/pull", {
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
            const event = JSON.parse(line) as { status?: string; error?: string; completed?: number; total?: number };
            if (event.error) {
              setPullError(event.error);
              setPullState("error");
              return;
            }
            if (event.total && event.completed) {
              setPullPhase("downloading");
              setPullProgress(Math.round((event.completed / event.total) * 100));
            } else if (event.status) {
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

  function startVoiceRecognition() {
    const speechRecognition = createSpeechRecognition(window as never);
    if (!speechRecognition.supported) {
      keepListeningRef.current = false;
      setVoiceError("Voice input is not available in this browser. Type your message instead.");
      return;
    }

    const recognizer = speechRecognition.recognizer;

    recognizer.onresult = (event) => {
      const transcript = getSpeechTranscript(event);
      if (!transcript) return;
      setInput((current) => {
        const normalizedTranscript = transcript.trim();
        if (!normalizedTranscript) return current;
        if (current.trimEnd().endsWith(normalizedTranscript)) return current;
        return current.trimEnd() ? `${current.trimEnd()} ${normalizedTranscript}` : normalizedTranscript;
      });
    };
    recognizer.onerror = (event) => {
      speechHadErrorRef.current = true;
      keepListeningRef.current = false;
      setVoiceError(describeSpeechRecognitionError(event.error));
      setIsListening(false);
      speechRecognitionRef.current = null;
    };
    recognizer.onend = () => {
      speechRecognitionRef.current = null;
      const shouldRestart = shouldRestartSpeechRecognition({
        keepListening: keepListeningRef.current,
        manuallyStopped: manuallyStoppedListeningRef.current,
        hadError: speechHadErrorRef.current,
      });

      if (!shouldRestart) {
        keepListeningRef.current = false;
        setIsListening(false);
        return;
      }

      speechRestartTimerRef.current = window.setTimeout(() => {
        speechRestartTimerRef.current = null;
        startVoiceRecognition();
      }, 250);
    };

    try {
      speechRecognitionRef.current = recognizer;
      setIsListening(true);
      recognizer.start();
    } catch {
      keepListeningRef.current = false;
      setIsListening(false);
      speechRecognitionRef.current = null;
      setVoiceError("Voice input could not start. Type your message or try again.");
    }
  }

  function handleVoiceInput() {
    setVoiceError(null);

    if (isListening) {
      manuallyStoppedListeningRef.current = true;
      keepListeningRef.current = false;
      if (speechRestartTimerRef.current !== null) window.clearTimeout(speechRestartTimerRef.current);
      speechRestartTimerRef.current = null;
      speechRecognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    manuallyStoppedListeningRef.current = false;
    speechHadErrorRef.current = false;
    keepListeningRef.current = true;
    startVoiceRecognition();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const question = input.trim();
    if (!question || chatDisabled || !selectedProvider) return;

    const now = Date.now();
    const userMessage: ChatMessage = { id: now, role: "user", text: question };
    const pendingMessage: ChatMessage = { id: now + 1, role: "bot", text: "", isPending: true };
    const requestMessages = [...messages, userMessage];

    setMessages([...requestMessages, pendingMessage]);
    setInput("");
    setVoiceError(null);
    setIsLoading(true);

    try {
      const response = await testingFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages.filter((message) => !message.isGreeting), model: selectedModel, provider: selectedProvider.id }),
      });

      const data = (await response.json()) as { reply?: string; error?: string; sources?: ChatSource[]; model?: string };
      if (data.model) setAssistantName(data.model);

      const botMessage: ChatMessage = {
        id: pendingMessage.id,
        role: "bot",
        text: data.reply ?? data.error ?? "The selected model did not return a response.",
        sources: data.reply ? data.sources : undefined,
        question: data.reply ? question : undefined,
        animate: true,
      };

      setMessages((currentMessages) => currentMessages.map((message) => (message.id === pendingMessage.id ? botMessage : message)));

      if (!response.ok && selectedProvider.id === "ollama") checkOllamaStatus();
    } catch (error) {
      const botMessage: ChatMessage = {
        id: pendingMessage.id,
        role: "bot",
        text: error instanceof Error ? error.message : "Unable to reach the selected model.",
        animate: true,
      };

      setMessages((currentMessages) => currentMessages.map((message) => (message.id === pendingMessage.id ? botMessage : message)));
      if (selectedProvider.id === "ollama") checkOllamaStatus();
    } finally {
      setIsLoading(false);
    }
  }

  function toggleMessageSpeech(message: ChatMessage) {
    setSpeechError(null);

    if (speakingMessageId === message.id) {
      window.speechSynthesis?.cancel();
      setSpeakingMessageId(null);
      return;
    }

    const speech = createSpeechUtterance(window as never, message.text);
    if (!speech.supported) {
      setSpeechError("Listening is not available in this browser.");
      return;
    }

    speech.synthesis.cancel();
    speech.utterance.onend = () => setSpeakingMessageId((current) => (current === message.id ? null : current));
    speech.utterance.onerror = () => {
      setSpeakingMessageId(null);
      setSpeechError("Unable to read this response aloud.");
    };

    setSpeakingMessageId(message.id);
    speech.synthesis.speak(speech.utterance);
  }

  async function submitFeedback(message: ChatMessage, rating: FeedbackRating) {
    setFeedbackByMessage((current) => ({ ...current, [message.id]: rating }));
    try {
      await testingFetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: message.question, answer: message.text, rating, documentIds: message.sources?.map((source) => source.documentId) }),
      });
    } catch {
      // Best-effort — feedback isn't on the critical path.
    }
  }

  async function downloadSource(source: ChatSource) {
    try {
      const response = await testingFetch(`/api/rag/documents/${source.documentId}/download?format=json`);
      if (!response.ok) return;
      const data = (await response.json()) as { url?: string };
      if (data.url) window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      // Download is a convenience action; the API auth banner handles 401s.
    }
  }

  function requestDifferentExplanation(source: ChatSource) {
    setInput(`Can you explain the content from "${source.title}" a different way?`);
    document.getElementById("message")?.focus();
  }

  async function copyMessageText(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId((current) => (current === message.id ? null : current)), 1500);
    } catch {
      // Clipboard access can fail; silently no-op for a convenience action.
    }
  }

  if (surfaceMode === "booting") {
    return <ChatBootSkeleton />;
  }

  if (surfaceMode === "provider") {
    return (
      <main className="flex h-full flex-col bg-white px-4 py-6 text-black">
        <section className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4">
          <header className="shrink-0 space-y-1.5">
            <p className="text-xs font-medium tracking-wide text-blue-600">Read-only knowledge base viewer</p>
            <h1 className="text-xl font-semibold tracking-tight text-black">Choose a chat provider</h1>
            <p className="text-sm leading-6 text-black/60">
              The testing UI reads approved knowledge only. The MCP server remains the write path for RAG and harness changes.
            </p>
          </header>

          {providers.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-32 rounded-xl bg-black/10" />
              <Skeleton className="h-32 rounded-xl bg-black/10" />
              <Skeleton className="h-32 rounded-xl bg-black/10" />
              <Skeleton className="h-32 rounded-xl bg-black/10" />
            </div>
          )}

          {providers.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => selectProvider(provider)}
                  className="flex min-h-32 flex-col justify-between rounded-xl border border-black/10 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                >
                  <span>
                    <span className="block text-base font-semibold text-black">{provider.shortLabel}</span>
                    <span className="mt-2 block text-xs leading-5 text-black/60">{provider.description}</span>
                  </span>
                  <span className={provider.configured || provider.id === "ollama" ? "mt-4 text-xs text-blue-600" : "mt-4 text-xs text-black/45"}>
                    {provider.configured || provider.id === "ollama" ? "Ready" : `Needs ${provider.envVar}`}
                  </span>
                </button>
              ))}
            </div>
          )}

          {showProviderSetup && selectedProvider && (
            <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-black">{selectedProvider.label} setup prompt</h2>
                  <p className="mt-1 text-xs text-black/60">Copy this into your coding assistant, add the key to <code>.env</code>, then reload this page.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={copySetupPrompt}>
                  {copiedSetupPrompt ? "Copied" : "Copy prompt"}
                  <Copy data-icon="inline-end" className="size-3.5" />
                </Button>
              </div>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-3 text-xs leading-5 text-black/70">{setupPrompt}</pre>
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col bg-white px-4 py-6 text-black">
      <section className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4">
        <header className="shrink-0 space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-blue-600">Read-only knowledge base viewer</p>
            <button type="button" onClick={changeProvider} className="text-xs text-black/50 underline underline-offset-4 hover:text-black">
              Change provider
            </button>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-black">Chat with {assistantName}</h1>
          <p className="text-sm leading-6 text-black/60">
            This chat searches and answers using only the approved knowledge base. It cannot add, edit, approve, or delete knowledge — those actions happen through MCP.
          </p>
        </header>

        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border border-black/10 px-4 py-3 text-sm">
          <label className="sr-only" htmlFor="model">Model</label>
          <select
            id="model"
            value={selectedModel}
            disabled={selectedProviderModels.length === 0 || pullState === "pulling"}
            onChange={(event) => setSelectedModel(event.target.value)}
            className="h-9 rounded-lg border border-black/10 bg-white px-2 text-sm text-black disabled:opacity-70"
          >
            {selectedProviderModels.map((model) => (
              <option key={model} value={model}>
                {model}{selectedProvider?.id === "ollama" && !installedModels.includes(model) ? " (not downloaded)" : ""}
              </option>
            ))}
          </select>

          <div className="flex flex-1 items-center gap-2">
            {selectedProvider?.id !== "ollama" && <span className="text-blue-600">Connected to {selectedProvider?.shortLabel}</span>}
            {selectedProvider?.id === "ollama" && serverStatus === "checking" && <span className="text-black/50">Checking Ollama...</span>}
            {selectedProvider?.id === "ollama" && serverStatus === "connected" && modelReady && <span className="text-blue-600">Connected to Ollama</span>}
            {selectedProvider?.id === "ollama" && serverStatus === "connected" && !modelReady && pullState !== "pulling" && (
              <span className="text-black/60"><code className="rounded bg-black/5 px-1 py-0.5">{selectedModel}</code> isn&apos;t downloaded yet.</span>
            )}
            {selectedProvider?.id === "ollama" && serverStatus === "connected" && pullState === "pulling" && (
              <span className="text-black/60">
                {pullPhase === "downloading" ? `Downloading ${selectedModel}${pullProgress !== null ? ` — ${pullProgress}%` : "..."}` : `${selectedModel}: ${pullStatusText ? describePullStatus(pullStatusText) : "Finalizing"}...`}
              </span>
            )}
            {selectedProvider?.id === "ollama" && (serverStatus === "disconnected" || serverStatus === "not-installed" || serverStatus === "starting" || serverStatus === "installing") && (
              <span className="text-black/50">
                {serverStatus === "installing" ? "Installing Ollama..." : serverStatus === "starting" ? "Starting Ollama..." : serverStatus === "not-installed" ? "Ollama isn't installed on this machine." : "Ollama isn't running."}
              </span>
            )}
          </div>

          {selectedProvider?.id === "ollama" && serverStatus !== "connected" && serverStatus !== "checking" && (
            <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={serverStatus === "starting" || serverStatus === "installing" || !canAutoStart} onClick={serverStatus === "not-installed" ? handleInstallOllama : handleConnect}>
              {serverStatus === "installing" ? "Installing..." : serverStatus === "starting" ? "Connecting..." : serverStatus === "not-installed" ? "Install Ollama" : "Connect to Ollama"}
            </Button>
          )}

          {selectedProvider?.id === "ollama" && serverStatus === "connected" && !modelReady && canAutoStart && (
            <Button type="button" size="sm" variant="outline" className="rounded-lg" disabled={pullState === "pulling"} onClick={handleDownloadModel}>
              {pullState === "pulling" ? "Downloading..." : "Download model"}
            </Button>
          )}
        </div>

        {connectError && <p className="shrink-0 text-xs text-black/50">{connectError}</p>}
        {pullError && <p className="shrink-0 text-xs text-black/50">{pullError}</p>}
        {selectedProvider?.id === "ollama" && !canAutoStart && serverStatus !== "connected" && serverStatus !== "checking" && (
          <p className="shrink-0 text-xs text-black/50">Auto-start/install isn&apos;t available for this configuration. Start Ollama yourself, then refresh this page.</p>
        )}
        {selectedProvider?.id === "ollama" && serverStatus === "connected" && !modelReady && !canAutoStart && (
          <p className="shrink-0 text-xs text-black/50">Auto-download isn&apos;t available for this configuration. Run <code className="rounded bg-black/5 px-1 py-0.5">ollama pull {selectedModel}</code> yourself, then refresh this page.</p>
        )}

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 py-1 pr-2">
            {messages.map((message) => {
              if (message.isPending) {
                return (
                  <div key={message.id} className="flex items-end gap-3 justify-start">
                    <PersonAvatar />
                    <PendingAssistantBubble />
                  </div>
                );
              }

              const visibleCharacters = message.animate ? (visibleMessageChars[message.id] ?? 0) : message.text.length;
              const displayedText = message.role === "bot" ? getTypewriterText(message.text, visibleCharacters) : message.text;
              const isTyping = Boolean(message.animate && visibleCharacters < message.text.length);

              return (
                <div key={message.id} className={`flex items-end gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "bot" && <PersonAvatar />}
                  <div className={message.role === "user" ? "max-w-[82%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground" : "min-h-11 max-w-[82%] whitespace-pre-wrap rounded-2xl rounded-bl-md border bg-muted px-4 py-3 text-sm leading-6 text-foreground"}>
                    {displayedText}
                    {isTyping && <span className="ml-0.5 inline-block h-4 w-1 translate-y-0.5 animate-pulse rounded-full bg-current" aria-hidden="true" />}
                    {!isTyping && message.sources && message.sources.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 whitespace-normal">
                        {message.sources.map((source) => (
                          <span key={source.documentId} className="inline-flex items-center gap-1">
                            {source.downloadable && (
                              <button type="button" onClick={() => downloadSource(source)} className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50">
                                <Download className="size-3" />{source.title}
                              </button>
                            )}
                            <button type="button" onClick={() => requestDifferentExplanation(source)} aria-label={`Explain ${source.title} a different way`} title="Explain this differently" className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-black/60 hover:bg-black/5 hover:text-black">
                              <MessageCircleQuestion className="size-3" />{!source.downloadable && source.title}
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {message.role === "bot" && !message.isGreeting && !isTyping && (
                      <div className="mt-2 flex items-center gap-1 whitespace-normal">
                        <button type="button" onClick={() => copyMessageText(message)} aria-label="Copy message" className="inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70">
                          {copiedMessageId === message.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        </button>
                        <button type="button" onClick={() => toggleMessageSpeech(message)} aria-label={speakingMessageId === message.id ? "Stop listening to response" : "Listen to response"} title={speakingMessageId === message.id ? "Stop listening" : "Listen to response"} className={speakingMessageId === message.id ? "inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600" : "inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"}>
                          {speakingMessageId === message.id ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
                        </button>
                        <button type="button" onClick={() => submitFeedback(message, "GOOD")} aria-label="Good response" className={feedbackByMessage[message.id] === "GOOD" ? "inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600" : "inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"}>
                          <ThumbsUp className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => submitFeedback(message, "BAD")} aria-label="Bad response" className={feedbackByMessage[message.id] === "BAD" ? "inline-flex size-6 items-center justify-center rounded-full bg-blue-50 text-blue-600" : "inline-flex size-6 items-center justify-center rounded-full text-black/40 hover:bg-black/5 hover:text-black/70"}>
                          <ThumbsDown className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && <PersonAvatar />}
                </div>
              );
            })}
            {isLoading && !hasPendingAssistantMessage && (
              <div className="flex items-end gap-3">
                <PersonAvatar />
                <ThinkingBubble />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {voiceError && <p className="shrink-0 text-xs text-black/50" role="status">{voiceError}</p>}
        {speechError && <p className="shrink-0 text-xs text-black/50" role="status">{speechError}</p>}

        <form onSubmit={handleSubmit} className="flex min-h-[60px] w-full shrink-0 items-center gap-2 rounded-2xl border border-black/10 bg-white p-2 shadow-sm">
          <label className="sr-only" htmlFor="message">Message</label>
          <Input id="message" value={input} onChange={(event) => setInput(event.target.value)} placeholder={providerReady ? "Ask a question..." : selectedProvider?.id === "ollama" && serverStatus === "connected" ? "Download the selected model to start chatting" : "Connect a provider to start chatting"} className="h-11 flex-1 border-0 bg-transparent px-3 shadow-none focus-visible:ring-0" disabled={chatDisabled} />
          <Button type="button" size="icon-lg" variant="outline" className={isListening ? "size-11 shrink-0 rounded-xl border-blue-300 bg-blue-50 text-blue-600" : "size-11 shrink-0 rounded-xl border-black/10 bg-black/[0.02] text-black/60 hover:text-black"} disabled={chatDisabled} aria-label={isListening ? "Stop voice input" : "Start voice input"} aria-pressed={isListening} title={isListening ? "Stop voice input" : "Start voice input"} onClick={handleVoiceInput}>
            <Mic className={isListening ? "size-4 animate-pulse" : "size-4"} />
          </Button>
          <Button type="submit" size="icon-lg" className="size-11 shrink-0 rounded-xl" disabled={chatDisabled} aria-label={isLoading ? "Waiting for response" : "Send message"}>
            <SendHorizontal className={isLoading ? "size-4 opacity-60" : "size-4"} />
          </Button>
        </form>
      </section>
    </main>
  );
}
