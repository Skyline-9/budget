import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-border/70 px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-accent/60 text-foreground",
        subtle: "bg-card/40 text-muted-foreground",
        success: "bg-primary/15 text-primary border-primary/30",
        income: "bg-income/15 text-income border-income/30",
        expense: "bg-expense/15 text-expense border-expense/30",
        danger: "bg-danger/15 text-danger border-danger/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

