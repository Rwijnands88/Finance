import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-[12px] border border-zinc-800 bg-zinc-950/70 px-3 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600",
        "focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-[12px] border border-zinc-800 bg-zinc-950/70 px-3 text-sm text-zinc-50 outline-none transition",
        "focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-[12px] border border-zinc-800 bg-zinc-950/70 px-3 py-3 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-600",
        "focus:border-indigo-400/70 focus:ring-2 focus:ring-indigo-500/20",
        className,
      )}
      {...props}
    />
  );
}
