import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export interface StatCardProps {
  /** Stat label / title */
  label: string;
  /** Primary value to display */
  value: string | number;
  /** Percentage or absolute change (positive = up, negative = down) */
  change?: number;
  /** Suffix for the change value (default: "%") */
  changeSuffix?: string;
  /** Optional icon rendered in the top-right corner */
  icon?: ReactNode;
  /** Additional class names */
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  changeSuffix = "%",
  icon,
  className,
}: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-[#1e1e2e] bg-[#111118] px-5 py-4",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-[#71717a]">{label}</p>
        {icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e1e2e] text-[#a1a1aa]">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-bold tracking-tight text-white">
          {value}
        </span>

        {change !== undefined && (
          <span
            className={cn(
              "mb-0.5 inline-flex items-center gap-0.5 text-xs font-medium",
              isPositive && "text-[#10b981]",
              isNegative && "text-[#ef4444]",
            )}
          >
            {isPositive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {isNegative ? "" : "+"}
            {change}
            {changeSuffix}
          </span>
        )}
      </div>
    </div>
  );
}
