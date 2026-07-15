import { ConnectionForm } from "./connection-form";
import type { SavedConnectionValues } from "@/lib/connection-keychain";

export function ConnectionGate({ savedValues }: { savedValues: SavedConnectionValues }) {
  return (
    <main className="flex h-full items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-black/10 bg-white">
        <div className="border-b border-black/10 bg-gradient-to-b from-slate-100 to-slate-50 px-6 py-4">
          <h1 className="text-lg font-semibold text-black">Configure Connection Gate</h1>
        </div>
        <div className="p-6">
          <ConnectionForm savedValues={savedValues} />
        </div>
      </div>
    </main>
  );
}
