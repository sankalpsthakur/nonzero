"use client";

import { useState, useCallback, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Inbox } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Column<T> {
  /** Unique key used for sorting and as React key */
  key: string;
  /** Column header label */
  header: string;
  /** Render function for the cell content */
  render: (row: T, index: number) => ReactNode;
  /** Whether this column is sortable (default: false) */
  sortable?: boolean;
  /** Custom sort comparator. Receives two rows + sort direction */
  comparator?: (a: T, b: T) => number;
  /** Optional header alignment */
  headerAlign?: "left" | "center" | "right";
  /** Optional min-width class */
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor for each row */
  getRowKey: (row: T, index: number) => string;
  /** Callback when a row is clicked */
  onRowClick?: (row: T, index: number) => void;
  /** Custom empty state message */
  emptyMessage?: string;
  /** Custom empty state icon */
  emptyIcon?: ReactNode;
  /** Additional class names for the wrapper */
  className?: string;
}

type SortDirection = "asc" | "desc";

interface SortState {
  key: string;
  direction: SortDirection;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  emptyMessage = "No data to display",
  emptyIcon,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(null);

  const handleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev?.key === key) {
          return prev.direction === "asc"
            ? { key, direction: "desc" }
            : null; // third click clears sort
        }
        return { key, direction: "asc" };
      });
    },
    [],
  );

  const sortedData = useMemo(() => {
    if (!sort) return data;

    const col = columns.find((c) => c.key === sort.key);
    if (!col || !col.sortable) return data;

    const comparator = col.comparator;
    if (!comparator) return data;

    const multiplier = sort.direction === "asc" ? 1 : -1;
    return [...data].sort((a, b) => comparator(a, b) * multiplier);
  }, [data, sort, columns]);

  // Empty state
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-[#1e1e2e] bg-[#111118] py-16",
          className,
        )}
      >
        {emptyIcon ?? <Inbox className="mb-3 h-10 w-10 text-[#52525b]" />}
        <p className="text-sm text-[#71717a]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-[#1e1e2e] bg-[#111118]",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Header */}
          <thead>
            <tr className="border-b border-[#1e1e2e]">
              {columns.map((col) => {
                const isSorted = sort?.key === col.key;
                const align = col.headerAlign ?? "left";

                return (
                  <th
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[#71717a]",
                      col.sortable && "cursor-pointer select-none hover:text-[#a1a1aa]",
                      align === "center" && "text-center",
                      align === "right" && "text-right",
                      col.className,
                    )}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && isSorted && (
                        sort.direction === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-[#1e1e2e]">
            {sortedData.map((row, idx) => (
              <tr
                key={getRowKey(row, idx)}
                className={cn(
                  "transition-colors",
                  onRowClick
                    ? "cursor-pointer hover:bg-[#1e1e2e]/50"
                    : "hover:bg-[#16161f]",
                )}
                onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "whitespace-nowrap px-4 py-3 text-[#a1a1aa]",
                      col.headerAlign === "center" && "text-center",
                      col.headerAlign === "right" && "text-right",
                      col.className,
                    )}
                  >
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
