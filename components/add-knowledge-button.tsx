"use client";

import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import { useRef, useState } from "react";

const PROVIDERS = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex CLI" },
  { id: "gemini", label: "Gemini CLI" },
] as const;

const LAST_PROVIDER_KEY = "add-knowledge-last-provider";

export function AddKnowledgeButton() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<string>(
    () =>
      (typeof window !== "undefined" &&
        window.localStorage.getItem(LAST_PROVIDER_KEY)) ||
      "claude",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const files = fileInputRef.current?.files;
    const formData = new FormData();
    formData.set("provider", provider);
    for (const file of Array.from(files ?? [])) formData.append("files", file);

    const response = await fetch("/api/knowledge/add", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.localStorage.setItem(LAST_PROVIDER_KEY, provider);
    setOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="relative">
      <Button
        onClick={() => setOpen((value) => !value)}
        variant="outline"
        size="sm"
        type="button"
      >
        <PlusCircle className="size-4" />
        Knowledge
      </Button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute right-0 top-full z-30 mt-2 w-72 space-y-3 rounded-lg border border-black/10 bg-white p-4 shadow-lg"
        >
          <div className="space-y-1.5">
            <label
              htmlFor="add-knowledge-provider"
              className="block text-sm text-black"
            >
              CLI
            </label>
            <select
              id="add-knowledge-provider"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
              className="w-full rounded-md border border-black/10 px-2 py-1.5 text-sm"
            >
              {PROVIDERS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="add-knowledge-files"
              className="block text-sm text-black"
            >
              Files (optional)
            </label>
            <input
              id="add-knowledge-files"
              ref={fileInputRef}
              type="file"
              multiple
              className="w-full text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Opening…" : "Open Terminal"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
