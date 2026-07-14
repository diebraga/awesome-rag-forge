"use client";

import { useState } from "react";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Local-only testing affordance: flips the in-memory simulate-disconnect
 * flag (lib/dev-disconnect.ts) so DatabaseSetupRequired/
 * DatabaseConnectionFailed can be previewed without editing DATABASE_URL
 * and restarting the server. Reloads the page after toggling, since
 * database connection status is read server-side.
 */
export function DevDisconnectToggle() {
  const [pending, setPending] = useState(false);

  async function handleToggle() {
    setPending(true);
    try {
      await fetch("/api/dev/toggle-disconnect", { method: "POST" });
      window.location.reload();
    } catch {
      setPending(false);
    }
  }

  return (
    <Button onClick={handleToggle} disabled={pending} variant="outline" size="sm">
      <WifiOff className="size-4" />
      {pending ? "Toggling…" : "Simulate disconnect"}
    </Button>
  );
}
