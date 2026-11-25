import { STATUS_LABELS, type DayStatus } from "../../../shared/status.ts";

// Text colours are dark enough for 4.5:1 on their own fills.
const STYLES: Record<DayStatus | "flag", string> = {
  on_track: "bg-sage-soft text-[#3c5d40]",
  partial: "bg-[#f6ecd9] text-[#6e5112]",
  not_logged: "bg-[#f1ebe3] text-[#5f5750]",
  flag: "bg-clay-soft text-[#8f4429]",
};

/** "On track" / "Partial" / "Not logged" / "Red flag": the same words everywhere. */
export function StatusChip({ status, flag, className = "" }: { status: DayStatus; flag?: boolean; className?: string }) {
  return (
    <span className={`inline-flex flex-wrap gap-1.5 ${className}`}>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STYLES[status]}`}>
        {STATUS_LABELS[status]}
      </span>
      {flag && (
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${STYLES.flag}`}>Red flag</span>
      )}
    </span>
  );
}
