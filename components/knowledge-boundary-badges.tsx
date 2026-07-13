type Audience = "EXTERNAL" | "INTERNAL" | "RESTRICTED" | string;

function audienceClass(audience: Audience) {
  if (audience === "RESTRICTED") return "border-red-200 bg-red-50 text-red-700";
  if (audience === "INTERNAL") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function AudienceBadge({ audience }: { audience: Audience }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${audienceClass(audience)}`}>
      {audience.toLowerCase()}
    </span>
  );
}

export function VisibilityBadges({ visibility }: { visibility: string[] }) {
  if (visibility.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {visibility.map((scope) => (
        <span
          key={scope}
          className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-[11px] font-medium text-black/60"
        >
          {scope.toLowerCase()}
        </span>
      ))}
    </span>
  );
}

export function ScopeBadge({ scope }: { scope: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
      {scope.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
