import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Mode } from "../../shared/types.ts";
import type { PostOp } from "../../shared/postop.ts";
import { api } from "./api.ts";

export interface SessionInfo {
  mode: Mode;
  today: string;
  surgeryDate: string;
  postOp: PostOp;
}

interface SessionCtx {
  session: SessionInfo | null;
  error: string | null;
  /** Comments from the other person not yet seen (me ↔ doctor). */
  unread: number;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  lock: () => Promise<void>;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setSession(await api.get<SessionInfo>("/auth/session"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const mode = session?.mode;
  const refreshUnread = useCallback(async () => {
    if (!mode || mode === "public") return setUnread(0);
    try {
      setUnread((await api.get<{ unread: number }>("/comments/inbox")).unread);
    } catch {
      // The badge is a nicety; ignore failures.
    }
  }, [mode]);

  const lock = useCallback(async () => {
    await api.post("/auth/lock");
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Check for new comments on load, when the tab regains focus, and every 2 minutes.
  useEffect(() => {
    refreshUnread();
    const onFocus = () => refreshUnread();
    window.addEventListener("focus", onFocus);
    const id = window.setInterval(refreshUnread, 120_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(id);
    };
  }, [refreshUnread]);

  return (
    <Ctx.Provider value={{ session, error, unread, refresh, refreshUnread, lock }}>{children}</Ctx.Provider>
  );
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
