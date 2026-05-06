import * as React from "react";

import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  ...rest
}: React.ComponentProps<"div"> & { value: number }) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("bg-muted relative h-2 w-full overflow-hidden rounded-full", className)}
      {...rest}
    >
      <div
        className="bg-primary h-full transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
