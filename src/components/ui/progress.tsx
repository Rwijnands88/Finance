import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
};

export function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
}: ProgressProps) {
  const width = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={cn("h-2.5 overflow-hidden rounded-full bg-zinc-950", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
      aria-valuemin={0}
    >
      <div
        className={cn("h-full rounded-full bg-indigo-500", indicatorClassName)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
