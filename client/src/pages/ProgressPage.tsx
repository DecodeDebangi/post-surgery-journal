import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "../../../shared/postop.ts";
import { api } from "../api.ts";
import { Heatmap } from "../components/Heatmap.tsx";
import { Link } from "../router.tsx";
import { useSession } from "../session.tsx";

interface DayStat {
  date: string;
  day: number;
  week: number;
  pain: number | null;
  stiffness: number | null;
  swelling: string | null;
  flexion_deg: number | null;
  extension_deg: number | null;
  done: number;
  total: number;
  opened: boolean;
}
interface WeekStat {
  week: number;
  done: number;
  total: number;
  pct: number;
}
interface Stats {
  days: DayStat[];
  weeks: WeekStat[];
  streak: { current: number; best: number };
  streakRule: string;
}

// Validated pair (light surface): terracotta + blue, ΔE 16 under protanopia.
const PAIN = "#c4704f";
const STIFFNESS = "#3f7fb8";
const ANGLE = "#3f7fb8";
const COMPLETION = "#628866";
const INK = "#2f2a26";
const MUTED = "#7a716a";
const GRID = "#ebe3da";

const shortDate = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function ProgressPage() {
  const { session } = useSession();
  const { mode, today, surgeryDate, postOp: now } = session!;
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);

  useEffect(() => {
    api.get<Stats>("/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  const dayHref = (date: string) => (date === today && mode !== "public" ? "/" : `/day/${date}`);

  if (error) return <p className="rounded-2xl bg-clay-soft p-3 text-sm text-clay">{error}</p>;
  if (!stats) return <p className="py-10 text-center text-muted">Loading…</p>;
  if (stats.days.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line p-6 text-center text-muted">
        Charts appear once a few days are logged.
      </p>
    );
  }

  const thisWeek = stats.weeks.find((w) => w.week === now.week);
  const lastFlex = [...stats.days].reverse().find((d) => d.flexion_deg !== null);
  const lastExt = [...stats.days].reverse().find((d) => d.extension_deg !== null);
  const flexDays = stats.days.filter((d) => d.flexion_deg !== null || d.extension_deg !== null);
  const feelDays = stats.days.filter((d) => d.pain !== null || d.stiffness !== null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Progress</h1>
        <p className="text-sm text-muted">
          How the knee is coming along since logging began on {formatDate(stats.days[0].date)}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Current streak" value={`${stats.streak.current} ${stats.streak.current === 1 ? "day" : "days"}`} note={`Best: ${stats.streak.best}`} />
        <Tile label={`Week ${now.week} so far`} value={thisWeek ? `${thisWeek.pct}%` : "—"} note={thisWeek ? `${thisWeek.done} of ${thisWeek.total} exercises` : "nothing yet"} />
        <Tile label="Latest bend" value={lastFlex ? `${lastFlex.flexion_deg}°` : "—"} note={lastFlex ? shortDate(lastFlex.date) : "not measured yet"} />
        <Tile label="Latest extension" value={lastExt ? `${lastExt.extension_deg}°` : "—"} note={lastExt ? `${shortDate(lastExt.date)} · 0° = fully straight` : "not measured yet"} />
      </div>
      <p className="-mt-2 text-[11px] text-muted">{stats.streakRule}</p>

      <Card title="Consistency" subtitle="Share of each day's exercises ticked.">
        <Heatmap days={stats.days} surgeryDate={surgeryDate} today={today} dayHref={dayHref} />
      </Card>

      <Card title="Knee bend (flexion)" subtitle="Degrees; higher is better.">
        {flexDays.some((d) => d.flexion_deg !== null) ? (
          <Chart>
            <LineChart data={flexDays} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis domain={["dataMin - 10", "dataMax + 10"]} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} unit="°" allowDecimals={false} />
              <Tooltip content={(p) => <Tip active={p.active} payload={p.payload as readonly TipEntry[]} unit="°" />} cursor={{ stroke: MUTED, strokeDasharray: "3 3" }} />
              <Line dataKey="flexion_deg" name="Bend" stroke={ANGLE} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </Chart>
        ) : (
          <Empty>Log a flexion angle on the Today page to see it here.</Empty>
        )}
      </Card>

      <Card title="Knee extension" subtitle="Degrees; 0° is fully straight, below 0 means it doesn't straighten fully.">
        {flexDays.some((d) => d.extension_deg !== null) ? (
          <Chart>
            <LineChart data={flexDays} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis domain={[(min: number) => Math.min(min - 2, -5), (max: number) => Math.max(max + 2, 5)]} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} unit="°" allowDecimals={false} />
              <Tooltip content={(p) => <Tip active={p.active} payload={p.payload as readonly TipEntry[]} unit="°" />} cursor={{ stroke: MUTED, strokeDasharray: "3 3" }} />
              <Line dataKey="extension_deg" name="Extension" stroke={ANGLE} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </Chart>
        ) : (
          <Empty>Log an extension angle on the Today page to see it here.</Empty>
        )}
      </Card>

      <Card title="Pain and stiffness" subtitle="0 = none, 10 = worst.">
        {feelDays.length ? (
          <>
            <Legend items={[["Pain", PAIN], ["Stiffness", STIFFNESS]]} />
            <Chart>
              <LineChart data={feelDays} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis domain={[0, 10]} ticks={[0, 5, 10]} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip content={(p) => <Tip active={p.active} payload={p.payload as readonly TipEntry[]} unit="/10" extra={(d) => (d.swelling ? `Swelling: ${d.swelling}` : null)} />} cursor={{ stroke: MUTED, strokeDasharray: "3 3" }} />
                <Line dataKey="pain" name="Pain" stroke={PAIN} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
                <Line dataKey="stiffness" name="Stiffness" stroke={STIFFNESS} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 4, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
              </LineChart>
            </Chart>
          </>
        ) : (
          <Empty>Log pain or stiffness on the Today page to see the trend.</Empty>
        )}
      </Card>

      <Card title="Weekly completion" subtitle="Exercises done ÷ exercises scheduled, per post-op week.">
        <Chart height={170}>
          <BarChart data={stats.weeks} margin={{ top: 8, right: 12, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="week" tickFormatter={(w) => `Wk ${w}`} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} unit="%" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              content={({ active, payload }) => {
                const w = payload?.[0]?.payload as WeekStat | undefined;
                if (!active || !w) return null;
                return (
                  <TipBox title={`Week ${w.week}`}>
                    {w.pct}% · {w.done} of {w.total} exercises
                  </TipBox>
                );
              }}
            />
            <Bar dataKey="pct" fill={COMPLETION} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </Chart>
      </Card>

      {mode !== "public" && (
        <Card title="Weekly summaries" subtitle="A one-screen recap of each week for your doctor, with its own comments.">
          <ul className="divide-y divide-line">
            {[...stats.weeks].reverse().map((w) => (
              <li key={w.week}>
                <Link href={`/week/${w.week}`} className="flex items-center justify-between py-2.5 text-[15px]">
                  <span>
                    Week {w.week}
                    {w.week === now.week && <span className="ml-2 text-xs text-muted">this week</span>}
                  </span>
                  <span className="text-sm text-muted">{w.pct}% →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <button onClick={() => setTable((t) => !t)} className="text-sm text-muted underline underline-offset-4">
        {table ? "Hide the numbers" : "Show the numbers as a table"}
      </button>
      {table && <NumbersTable days={stats.days} />}
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{note}</div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function Chart({ children, height = 200 }: { children: ReactNode; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted">{children}</p>;
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mb-2 flex gap-4 text-xs text-ink">
      {items.map(([label, color], i) => (
        <span key={label} className="flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden>
            <line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={i ? "5 3" : undefined} />
          </svg>
          {label}
        </span>
      ))}
    </div>
  );
}

function TipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md" style={{ color: INK }}>
      <div className="mb-0.5 font-semibold">{title}</div>
      {children}
    </div>
  );
}

interface TipEntry {
  dataKey?: unknown;
  name?: unknown;
  value?: unknown;
  color?: string;
  payload?: unknown;
}

function Tip({
  active,
  payload,
  unit,
  extra,
}: {
  active?: boolean;
  payload?: readonly TipEntry[];
  unit: string;
  extra?: (d: DayStat) => string | null;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayStat;
  return (
    <TipBox title={`${shortDate(d.date)} · Day ${d.day}`}>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={String(p.dataKey)} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: p.color }} />
            {String(p.name)}: <span className="font-semibold">{String(p.value)}{unit}</span>
          </div>
        ))}
      {extra?.(d) && <div className="text-muted">{extra(d)}</div>}
    </TipBox>
  );
}

function NumbersTable({ days }: { days: DayStat[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-card">
      <table className="w-full text-left text-xs tabular-nums">
        <thead className="text-muted">
          <tr>
            {["Date", "Done", "Pain", "Stiff.", "Swelling", "Bend", "Ext."].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {[...days].reverse().map((d) => (
            <tr key={d.date}>
              <td className="px-3 py-1.5 whitespace-nowrap">{shortDate(d.date)}</td>
              <td className="px-3 py-1.5">{d.total ? `${d.done}/${d.total}` : "rest"}</td>
              <td className="px-3 py-1.5">{d.pain ?? "—"}</td>
              <td className="px-3 py-1.5">{d.stiffness ?? "—"}</td>
              <td className="px-3 py-1.5 capitalize">{d.swelling ?? "—"}</td>
              <td className="px-3 py-1.5">{d.flexion_deg !== null ? `${d.flexion_deg}°` : "—"}</td>
              <td className="px-3 py-1.5">{d.extension_deg !== null ? `${d.extension_deg}°` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
