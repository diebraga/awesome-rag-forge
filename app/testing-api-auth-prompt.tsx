"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  storeTestingApiKey,
  TESTING_API_AUTH_EVENT,
} from "@/lib/testing-api-client";

export function TestingApiAuthPrompt() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("Enter APP_API_KEY to unlock this testing UI.");
  const [value, setValue] = useState("");

  useEffect(() => {
    function handleAuthRequired(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (typeof detail?.message === "string") {
        setMessage(detail.message);
      }
      setVisible(true);
    }

    window.addEventListener(TESTING_API_AUTH_EVENT, handleAuthRequired);
    return () => window.removeEventListener(TESTING_API_AUTH_EVENT, handleAuthRequired);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = value.trim();
    if (!key) return;
    storeTestingApiKey(key);
    window.location.reload();
  }

  if (!visible) return null;

  return (
    <div className="border-b border-black/10 bg-blue-50 px-4 py-3 text-black">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-2xl flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <KeyRound className="size-4 shrink-0 text-blue-600" />
          <span>{message}</span>
        </div>
        <Input
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="APP_API_KEY"
          className="h-9 bg-white sm:w-64"
        />
        <Button type="submit" size="sm" className="h-9">
          Save key
        </Button>
      </form>
    </div>
  );
}
