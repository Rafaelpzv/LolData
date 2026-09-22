import { cn } from "@/lib/utils";

/** Page body: container width, vertical rhythm between sections. */
export function PageShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("container space-y-6 py-6 sm:space-y-8 sm:py-8", className)}>{children}</div>;
}

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Controls aligned to the right on desktop (filters, pickers). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
