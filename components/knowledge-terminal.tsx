"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Minus, PlusCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" },
] as const;

const LAST_PROVIDER_KEY = "add-knowledge-last-provider";
const INITIAL_PROMPT = "Let's add some knowledge to the knowledge base.";

type TerminalContextValue = { open: boolean; setOpen: (open: boolean) => void };
const TerminalContext = createContext<TerminalContextValue | null>(null);

export function KnowledgeTerminalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <TerminalContext.Provider value={{ open, setOpen }}>{children}</TerminalContext.Provider>;
}

function useTerminalContext() {
  const context = useContext(TerminalContext);
  if (!context) throw new Error("KnowledgeTerminal components must be used within a KnowledgeTerminalProvider");
  return context;
}

/** The header button -- lives in the header row, toggles the panel rendered elsewhere in the layout. */
export function KnowledgeTerminalToggle() {
  const { open, setOpen } = useTerminalContext();
  return (
    <Button onClick={() => setOpen(!open)} variant="outline" size="sm" type="button">
      <PlusCircle className="size-4" />
      Terminal
    </Button>
  );
}

/**
 * The sliding panel itself. Rendered as an in-flow flex column (not fixed/
 * overlay) so opening it pushes the rest of the app (header + content) over
 * instead of covering it -- must be a sibling of the header/content column
 * in the layout, not nested inside the header.
 */
export function KnowledgeTerminalPanel() {
  const { open, setOpen } = useTerminalContext();
  // Session lifecycle is deliberately decoupled from `open`: collapsing the
  // panel (open -> false) only hides it visually -- the PTY session and the
  // xterm instance stay alive underneath (container div stays mounted, just
  // width: 0). Only the explicit Close button ends the session. Without this
  // split, every collapse/expand would kill and respawn the CLI.
  const [sessionActive, setSessionActive] = useState(false);
  const [provider, setProvider] = useState<string>(
    () => (typeof window !== "undefined" && window.localStorage.getItem(LAST_PROVIDER_KEY)) || "claude",
  );
  const [attaching, setAttaching] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (open && !sessionActive) setSessionActive(true);
  }, [open, sessionActive]);

  useEffect(() => {
    if (!sessionActive) return;
    let cancelled = false;

    async function startSession() {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { invoke } = await import("@tauri-apps/api/core");
      const { listen } = await import("@tauri-apps/api/event");
      if (cancelled || !containerRef.current) return;

      const term = new Terminal({ convertEol: true, fontSize: 13 });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();
      term.focus();
      term.onData((data) => {
        invoke("write_pty", { data }).catch((error) => setSessionError(String(error)));
      });
      terminalRef.current = term;

      const unlistenOutput = await listen<string>("pty-output", (event) => {
        term.write(event.payload);
      });
      unlistenRefs.current.push(unlistenOutput);

      setSessionError(null);
      try {
        window.localStorage.setItem(LAST_PROVIDER_KEY, provider);
        const response = await fetch("/api/knowledge/resolve-command", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: provider, prompt: INITIAL_PROMPT }),
        });
        const result = await response.json();
        if (!result.ok) {
          setSessionError(result.error);
          return;
        }
        await invoke("spawn_pty", { program: result.program, args: result.args, cwd: result.cwd });
        // Rust opens the PTY at a hardcoded 32x100 -- tell it the terminal's
        // real size so size-aware interactive CLIs (e.g. Ink-based TUIs like
        // Claude Code) render and read input correctly instead of assuming
        // a mismatched size.
        const dims = fitAddon.proposeDimensions();
        if (dims) await invoke("resize_pty", { rows: dims.rows, cols: dims.cols });
      } catch {
        setSessionError("Unable to start a terminal session. This panel only works inside the desktop app.");
      }
    }

    startSession();

    return () => {
      cancelled = true;
      unlistenRefs.current.forEach((unlisten) => unlisten());
      unlistenRefs.current = [];
      terminalRef.current?.dispose();
      terminalRef.current = null;
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("kill_pty").catch(() => {}));
    };
    // Re-runs on provider change (kills + respawns) and when the session
    // ends via the Close button (cleanup only) -- NOT on collapse/expand.
  }, [sessionActive, provider]);

  /**
   * The panel no longer has its own chat composer -- the terminal itself is
   * the chat (type directly into the live CLI session). Attach is the one
   * thing typing into a real terminal can't do: pick local files. Selecting
   * files stages them into .rag-inbox/ and immediately types a notice into
   * the session, so there's no separate "send" step to remember.
   */
  async function handleAttach(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setAttaching(true);

    const formData = new FormData();
    for (const file of list) formData.append("files", file);
    const response = await fetch("/api/knowledge/stage-files", { method: "POST", body: formData });
    const result = await response.json();
    if (!result.ok) {
      setSessionError(result.error);
      setAttaching(false);
      return;
    }

    const { invoke } = await import("@tauri-apps/api/core");
    try {
      // Sent as two separate writes, not one "text\r" blob: typing directly
      // into the terminal sends Enter as its own standalone keystroke, and
      // some interactive prompts only recognize a lone "\r" as submit -- one
      // bundled directly after text can land as inserted text instead.
      await invoke("write_pty", { data: `New files added: ${result.files.join(", ")} in .rag-inbox/.` });
      await invoke("write_pty", { data: "\r" });
    } catch (error) {
      setSessionError(String(error));
    }

    setAttaching(false);
  }

  // Lets a copied file (Finder "Copy", a screenshot, etc.) be pasted straight
  // in with Cmd+V, without opening the file picker -- the Attach button stays
  // as-is for browsing. Only intercepts pastes that actually carry a file;
  // a plain-text paste (e.g. into the live terminal) is left alone so it
  // still reaches whatever has focus.
  useEffect(() => {
    if (!open) return;

    function handlePaste(event: ClipboardEvent) {
      const files = event.clipboardData?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      handleAttach(files);
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open]);

  return (
    <div
      className={cn(
        "h-full shrink-0 overflow-hidden border-r border-black/10 bg-white transition-[width] duration-200 ease-out",
        open ? "w-[420px]" : "w-0",
      )}
    >
      <div className="flex h-full w-[420px] flex-col">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className="rounded-md border border-black/10 px-2 py-1 text-sm"
          >
            {PROVIDERS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse terminal"
              title="Collapse (keeps the session running)"
            >
              <Minus className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setSessionActive(false);
                setOpen(false);
              }}
              aria-label="Close terminal"
              title="Close (ends the session)"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {sessionError && <p className="px-4 py-2 text-sm text-red-600">{sessionError}</p>}

        <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden bg-black" />

        <div className="border-t border-black/10 p-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              handleAttach(event.target.files);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={attaching}
            onClick={() => fileInputRef.current?.click()}
          >
            {attaching ? "Adding…" : "Attach files"}
          </Button>
          <p className="mt-1.5 text-center text-xs text-black/40">or paste a copied file with ⌘V</p>
        </div>
      </div>
    </div>
  );
}
