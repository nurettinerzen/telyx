import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400",
        secondary:
          "bg-gray-100 dark:bg-white/8 text-gray-700 dark:text-gray-300",
        destructive:
          "bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-400",
        success:
          "bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400",
        warning:
          "bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400",
        info:
          "bg-info-100 dark:bg-info-900/30 text-info-700 dark:text-info-400",
        outline:
          "border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
