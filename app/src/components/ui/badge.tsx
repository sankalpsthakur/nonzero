import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-tight transition-colors",
  {
    variants: {
      variant: {
        success:
          "bg-[#10b981]/15 text-[#10b981] border border-[#10b981]/20",
        warning:
          "bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/20",
        danger:
          "bg-[#ef4444]/15 text-[#ef4444] border border-[#ef4444]/20",
        info:
          "bg-[#3b82f6]/15 text-[#3b82f6] border border-[#3b82f6]/20",
        neutral:
          "bg-[#71717a]/15 text-[#a1a1aa] border border-[#71717a]/20",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
