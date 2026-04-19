import * as React from "react";
import { cn } from "@/lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-10 w-full rounded-md border border-line bg-canvas-3 px-3 text-sm text-ink",
        "placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[96px] w-full rounded-md border border-line bg-canvas-3 px-3 py-2 text-sm text-ink",
        "placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-3",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
