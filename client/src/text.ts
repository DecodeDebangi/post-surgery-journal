// Small bits of copy that depend on who is looking.

export function privateNote(mode: string): string {
  return mode === "doctor" ? "Only you and the patient see these." : "Only you and your doctor see these.";
}
