import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sketch text-lg font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0 font-hand tracking-wide",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border-2 border-sketch-ink shadow-sketch hover:shadow-sketch-lg hover:-translate-y-1 hover:rotate-1 active:shadow-sketch-sm active:translate-y-0 active:rotate-0",
        destructive:
          "bg-destructive text-destructive-foreground border-2 border-sketch-ink shadow-sketch hover:shadow-sketch-lg hover:-translate-y-1 hover:rotate-1",
        outline:
          "border-2 border-sketch-ink bg-background shadow-sketch hover:bg-accent hover:text-accent-foreground hover:-translate-y-1 hover:rotate-1",
        secondary:
          "bg-secondary text-secondary-foreground border-2 border-sketch-ink shadow-sketch hover:shadow-sketch-lg hover:-translate-y-1 hover:rotate-1",
        ghost: "hover:bg-accent hover:text-accent-foreground hover:rotate-1",
        link: "text-primary underline-offset-4 hover:underline decoration-wavy",
        sketch:
          "bg-white text-sketch-ink border-2 border-sketch-ink shadow-sketch hover:shadow-sketch-lg hover:-translate-y-1 hover:rotate-1 active:shadow-sketch-sm active:translate-y-0 active:rotate-0",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 rounded-sketch px-4 text-base",
        lg: "h-14 rounded-sketch px-8 text-xl",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
