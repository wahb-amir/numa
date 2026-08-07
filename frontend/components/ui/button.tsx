import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-control text-sm font-semibold transition-colors duration-150 ease-editorial disabled:pointer-events-none disabled:opacity-50 min-h-[44px]",
  {
    variants: {
      variant: {
        primary: "bg-accent-emerald text-text-inverse hover:bg-[#325a46]",
        secondary:
          "border border-border-strong bg-surface-raised text-text-primary hover:bg-surface-sunken",
        ghost: "text-text-secondary hover:bg-surface-sunken hover:text-text-primary",
      },
      size: {
        default: "px-4 py-2",
        sm: "px-3 py-1.5 text-xs min-h-[36px]",
        lg: "px-6 py-3 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
