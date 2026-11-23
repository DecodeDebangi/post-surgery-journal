import { useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { navigate } from "../router.tsx";
import { useSession } from "../session.tsx";

export function UnlockPage() {
  const { refresh } = useSession();
  const [as, setAs] = useState<"me" | "doctor">("me");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/unlock", { pin: value, as });
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setError((e as Error).message);
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  function onChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setPin(digits);
    if (digits.length === 6) submit(digits);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    submit(pin);
  }

  const doctor = as === "doctor";

  return (
    <div className="mx-auto max-w-sm pt-6">
      <div className={`rounded-2xl border p-6 ${doctor ? "border-sky/30 bg-sky-soft" : "border-line bg-card"}`}>
        <h1 className="text-lg font-semibold">{doctor ? "Doctor login" : "Enter the PIN"}</h1>
        <p className="mt-1 text-sm text-muted">
          {doctor
            ? "Use the doctor PIN to see the full log, comment and update the exercise and medicine plan."
            : "The journal is public to read. The PIN unlocks logging, editing and the prescription."}
        </p>
        <form onSubmit={onSubmit} className="mt-5">
          <label htmlFor="pin" className="sr-only">
            6-digit PIN
          </label>
          <input
            id="pin"
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            disabled={busy}
            onChange={(e) => onChange(e.target.value)}
            placeholder="••••••"
            className="w-full rounded-xl border border-line bg-white px-4 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:border-sage"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-clay">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || pin.length !== 6}
            className="mt-4 w-full rounded-xl bg-ink py-3 font-medium text-white disabled:opacity-40"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
      <button
        onClick={() => {
          setAs(doctor ? "me" : "doctor");
          setPin("");
          setError(null);
        }}
        className="mt-4 w-full py-2 text-sm text-muted underline underline-offset-4"
      >
        {doctor ? "Not the doctor? Use the site PIN" : "I'm the doctor"}
      </button>
    </div>
  );
}
