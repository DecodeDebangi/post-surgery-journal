import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.ts";
import { DayPage } from "./pages/DayPage.tsx";
import { WeekPage } from "./pages/WeekPage.tsx";

// The charts library is the biggest dependency; only load it on the Progress page.
const LazyProgress = lazy(() => import("./pages/ProgressPage.tsx").then((m) => ({ default: m.ProgressPage })));
const ProgressPage = () => (
  <Suspense fallback={<p className="py-10 text-center text-muted">Loading charts…</p>}>
    <LazyProgress />
  </Suspense>
);
import { HistoryPage } from "./pages/HistoryPage.tsx";
import { InboxPage } from "./pages/InboxPage.tsx";
import { PrescriptionPage } from "./pages/PrescriptionPage.tsx";
import { TimelinePage } from "./pages/TimelinePage.tsx";
import { UnlockPage } from "./pages/UnlockPage.tsx";
import { Link, match, navigate, usePath } from "./router.tsx";
import { useSession } from "./session.tsx";

/** Current streak for the desktop sidebar; only fetched on wide screens. */
function useStreak(mode: string | undefined, path: string): number | null {
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!mode || !window.matchMedia("(min-width: 1024px)").matches) return;
    api
      .get<{ streak: { current: number } }>("/stats")
      .then((r) => setStreak(r.streak.current))
      .catch(() => setStreak(null));
    // Re-check when moving between pages, so ticking exercises updates it.
  }, [mode, path]);
  return streak;
}

export function App() {
  const { session, error, unread, lock } = useSession();
  const path = usePath();
  const streak = useStreak(session?.mode, path);

  if (!session) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center text-muted">
        {error ? (
          <div>
            <p className="mb-3">{error}</p>
            <button className="rounded-full bg-ink px-4 py-2 text-white" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        ) : (
          "Loading…"
        )}
      </div>
    );
  }

  const { mode, postOp: today } = session;
  const day = match("/day/:date", path);
  const week = match("/week/:n", path);

  let page;
  if (match("/unlock", path)) page = <UnlockPage />;
  else if (match("/prescription", path)) page = <PrescriptionPage />;
  else if (match("/prescription/history", path)) page = <HistoryPage />;
  else if (match("/comments", path)) page = <InboxPage />;
  else if (match("/timeline", path)) page = <TimelinePage />;
  else if (match("/progress", path)) page = <ProgressPage />;
  else if (week) page = <WeekPage key={week.n} week={Number(week.n)} />;
  else if (day) page = <DayPage key={day.date} date={day.date} />;
  // The public lands on the scrapbook; me and the doctor land on today's log.
  else if (mode === "public") page = <TimelinePage />;
  else page = <DayPage key="today" date={session.today} />;

  async function exit() {
    await lock();
    navigate("/");
  }

  const todayHref = mode === "public" ? `/day/${session.today}` : "/";
  const tabs =
    mode === "public"
      ? [
          { href: "/", label: "Journey", icon: "📖", active: path === "/" || path === "/timeline", badge: 0 },
          { href: todayHref, label: "Today", icon: "📅", active: !!day, badge: 0 },
          { href: "/progress", label: "Progress", icon: "📈", active: path === "/progress", badge: 0 },
        ]
      : [
          { href: "/", label: "Today", icon: "📅", active: path === "/" || !!day, badge: 0 },
          { href: "/timeline", label: "Journey", icon: "📖", active: path === "/timeline", badge: 0 },
          { href: "/progress", label: "Progress", icon: "📈", active: path === "/progress" || !!week, badge: 0 },
          { href: "/comments", label: "Comments", icon: "💬", active: path === "/comments", badge: unread },
          { href: "/prescription", label: "Plan", icon: "📋", active: path.startsWith("/prescription"), badge: 0 },
        ];

  // The Today page uses two columns on desktop; reading pages stay at a comfortable width.
  const wide = path === "/" ? mode !== "public" : !!day;

  return (
    <div className="lg:flex">
      <Sidebar
        tabs={tabs}
        mode={mode}
        label={today.label}
        streak={streak}
        onExit={exit}
        showLogin={mode === "public" && !match("/unlock", path)}
      />
    <div className="mx-auto min-h-dvh max-w-xl pb-24 lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1 lg:pb-12">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="min-w-0">
            <div className="truncate text-base font-semibold">Post-Surgery Journal</div>
            <div className="text-sm text-muted">{today.label}</div>
          </Link>
          {mode === "doctor" && (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-sky-soft px-3 py-1 text-xs font-semibold text-sky">Doctor mode</span>
              <button onClick={exit} className="rounded-full border border-line px-3 py-1 text-xs">
                Exit
              </button>
            </div>
          )}
          {mode === "me" && (
            <button onClick={exit} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
              Lock
            </button>
          )}
          {mode === "public" && !match("/unlock", path) && (
            <Link href="/unlock" className="rounded-full border border-line px-3 py-1 text-xs text-muted">
              Log in
            </Link>
          )}
        </div>
      </header>

      <main className={`px-4 py-4 lg:mx-auto lg:px-10 lg:py-8 ${wide ? "lg:max-w-6xl" : "lg:max-w-3xl"}`}>{page}</main>

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-xl">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-1 flex-col items-center py-2 text-xs ${t.active ? "font-semibold text-ink" : "text-muted"}`}
              >
                <span className="relative text-lg" aria-hidden>
                  {t.icon}
                  {t.badge ? (
                    <span className="absolute -top-1 -right-3 min-w-5 rounded-full bg-clay px-1.5 text-center text-[10px] leading-5 font-semibold text-white">
                      {t.badge}
                    </span>
                  ) : null}
                </span>
                {t.label}
                {t.badge ? <span className="sr-only"> ({t.badge} unread)</span> : null}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </div>
    </div>
  );
}

interface Tab {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge: number;
}

const ICONS: Record<string, ReactNode> = {
  Today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  Journey: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5" />
    </>
  ),
  Progress: <path d="M3 20h18M6 16l4-5 4 3 5-7" />,
  Comments: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  Plan: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12h6M9 16h4" />
    </>
  ),
};

/** Desktop navigation (1024px and wider). Phones keep the bottom tab bar. */
function Sidebar({
  tabs,
  mode,
  label,
  streak,
  onExit,
  showLogin,
}: {
  tabs: Tab[];
  mode: string;
  label: string;
  streak: number | null;
  onExit: () => void;
  showLogin: boolean;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-7 border-r border-line bg-[#f6f0e8] px-5 py-7 lg:flex">
      <Link href="/" className="flex flex-col gap-1">
        <span className="text-[17px] font-bold">Post-Surgery Journal</span>
        <span className="text-[13px] text-muted">{label}</span>
      </Link>
      {mode === "doctor" && (
        <span className="self-start rounded-full bg-sky-soft px-3 py-1 text-xs font-semibold text-sky">Doctor mode</span>
      )}
      <nav aria-label="Main" className="flex flex-col gap-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] ${
              t.active ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(60,40,20,0.08)]" : "text-muted hover:bg-white/60 hover:text-ink"
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {ICONS[t.label]}
            </svg>
            {t.label}
            {t.badge ? (
              <span className="ml-auto rounded-full bg-clay px-2 text-[11px] leading-5 font-bold text-white">
                {t.badge}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-3">
        {streak !== null && (
          <Link href="/progress" className="flex flex-col gap-0.5 rounded-xl border border-line bg-white p-3">
            <span className="text-xs text-muted">Streak</span>
            <span className="text-xl font-semibold">
              {streak} {streak === 1 ? "day" : "days"}
            </span>
          </Link>
        )}
        {mode === "public" ? (
          showLogin && (
            <Link href="/unlock" className="self-start rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:text-ink">
              Log in
            </Link>
          )
        ) : (
          <button onClick={onExit} className="self-start rounded-full border border-line px-4 py-1.5 text-sm text-muted hover:text-ink">
            {mode === "doctor" ? "Exit doctor mode" : "Lock"}
          </button>
        )}
      </div>
    </aside>
  );
}
