import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium outline-none transition disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:ring-2 focus-visible:ring-indigo-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090B]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

const variants = {
  primary:
    "bg-indigo-500 text-white shadow-[0_14px_35px_rgba(99,102,241,0.24)] hover:bg-indigo-400",
  secondary:
    "border border-zinc-800 bg-zinc-900/80 text-zinc-100 hover:border-zinc-700 hover:bg-zinc-800",
  ghost: "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50",
  danger: "bg-red-500 text-white hover:bg-red-400",
};

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-5 text-base",
  icon: "h-10 w-10",
};
