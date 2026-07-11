// Single structural source of truth for the operating mode. DEVELOPER_MODE is
// a convention that governs how the connected AI assistant behaves (whether it
// may edit repository source), documented in docs/operating-modes.md. Reading
// it here — instead of relying on the model to remember which mode it's in —
// is what makes the mode indicator deterministic and frictionless.
//
// Fail safe: anything other than an explicit "true" (including unset) is
// Operator Mode. Developer Mode must be opted into, never the default.
export function isDeveloperMode(): boolean {
  return process.env.DEVELOPER_MODE?.trim().toLowerCase() === "true";
}
