import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva("flex gap-3 rounded-lg border px-4 py-3 text-sm", {
  variants: {
    variant: {
      destructive: "border-destructive/40 bg-destructive/10 text-destructive",
      warning: "border-warning/40 bg-warning/10 text-warning",
      info: "border-border bg-surface text-foreground",
    },
  },
  defaultVariants: { variant: "info" },
});

const ICONS = { destructive: XCircle, warning: AlertTriangle, info: Info } as const;

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title">, VariantProps<typeof alertVariants> {
  title?: React.ReactNode;
  action?: React.ReactNode;
}

export function Alert({ className, variant = "info", title, action, children, ...props }: AlertProps) {
  const Icon = ICONS[variant ?? "info"];
  return (
    <div
      role={variant === "info" ? "status" : "alert"}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
