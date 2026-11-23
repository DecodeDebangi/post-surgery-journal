import { lazy, Suspense } from "react";
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

export function App() {
  const { session, error, unread, lock } = useSession();
  const path = usePath();

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

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 backdrop-blur">
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

      <main className="px-4 py-4">{page}</main>

      {tabs.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
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
  );
}
