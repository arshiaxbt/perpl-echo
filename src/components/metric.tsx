import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function Metric({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-sm border border-border bg-muted/35 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div
        className={cn("mt-1 text-lg font-semibold", {
          "text-primary": tone === "good",
          "text-destructive": tone === "bad",
          "text-accent": tone === "warn"
        })}
      >
        {value}
      </div>
    </div>
  );
}
