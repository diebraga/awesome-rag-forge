"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";

// Permanent, deterministic Developer Mode warning. Rendered by the app (not
// the model) whenever DEVELOPER_MODE=true, so it is always present with every
// answer — no reliance on the assistant remembering to say so.
//
// There is deliberately no one-click toggle here: this is the read-only chat
// surface, which must never write configuration, and the mode governs the AI
// assistant's own behavior (read from .env, not the browser) — so a browser
// button could not change it anyway. Switching back is a one-line .env edit,
// which this makes copy-paste easy.
export function DeveloperModeBanner() {
  const [copied, setCopied] = useState(false);

  function copySwitchBack() {
    navigator.clipboard?.writeText("DEVELOPER_MODE=false").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs text-amber-900">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          <strong>Developer Mode is active.</strong> The connected AI assistant may modify repository
          source files after your confirmation. To return to Operator Mode, set{" "}
          <code className="rounded bg-amber-200 px-1">DEVELOPER_MODE=false</code> in{" "}
          <code className="rounded bg-amber-200 px-1">.env</code> and restart the session.
        </span>
      </span>
      <button
        type="button"
        onClick={copySwitchBack}
        className="flex shrink-0 items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 font-medium hover:bg-amber-200"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy switch-back"}
      </button>
    </div>
  );
}
