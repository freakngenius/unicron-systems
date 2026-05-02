import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  "inline-flex items-center justify-center font-sans font-medium rounded-md transition " +
  "disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-canvas hover:bg-ink-2",
  ghost: "bg-transparent text-ink hover:bg-canvas-3",
  outline: "border border-line text-ink hover:bg-canvas-2",
  danger: "bg-[#d87a7a] text-canvas hover:opacity-90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  ),
);
Button.displayName = "Button";
