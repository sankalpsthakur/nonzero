import { cn } from "@/lib/utils";

export interface MetricBadgeProps {
  /** Metric label */
  label: string;
  /** Metric value to display */
  value: string | number;
  /** Whether the value is "good" (green), "bad" (red), or "neutral" (gray) */
  sentiment?: "good" | "bad" | "neutral";
  /** Optional suffix (e.g. "%", "x", "ms") */
  suffix?: string;
  /** Additional class names */
  className?: string;
}

export function MetricBadge({
  label,
  value,
  sentiment = "neutral",
  suffix,
  className,
}: MetricBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
        sentiment === "good" &&
          "border-[#10b981]/20 bg-[#10b981]/10 text-[#10b981]",
        sentiment === "bad" &&
          "border-[#ef4444]/20 bg-[#ef4444]/10 text-[#ef4444]",
        sentiment === "neutral" &&
          "border-[#71717a]/20 bg-[#71717a]/10 text-[#a1a1aa]",
        className,
      )}
    >
      <span className="font-normal text-[#a1a1aa]">{label}</span>
      <span className="font-semibold">
        {value}
        {suffix}
      </span>
    </span>
  );
}
