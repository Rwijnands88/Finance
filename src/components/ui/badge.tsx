import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border border-zinc-800 bg-zinc-950/80 px-3 text-xs font-medium text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}
