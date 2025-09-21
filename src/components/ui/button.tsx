import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-95 touch-manipulation",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        wui:
          "bg-wui-button border border-solid border-[rgba(255,255,255,0.4)] text-white shadow hover:opacity-80",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        "wui-outline":
          "border border-solid border-[hsl(var(--border))] text-white hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
      },
      size: {
        default: "h-10 px-6 py-1.5 rounded-[20px]",
        sm: "h-8 px-4 py-1 text-sm rounded-[16px]",
        lg: "h-12 px-8 py-2 text-lg rounded-[24px]",
        icon: "h-10 w-10 min-w-10 px-1.5 rounded-full",
        "icon-sm": "h-8 w-8 min-w-8 px-1.5 rounded-full",
        "icon-lg": "h-12 w-12 min-w-12 px-2 rounded-full"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const [isPressed, setIsPressed] = React.useState(false);
    const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
    const hasMoved = React.useRef(false);

    const Comp = asChild ? Slot : "button";

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      // Only trigger click if this wasn't a scroll gesture
      if (!hasMoved.current && !props.disabled && onClick) {
        onClick(e);
      }
    }, [onClick, props.disabled]);

    const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      hasMoved.current = false;
      setIsPressed(true);
    }, []);

    const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
      if (touchStartPos.current) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

        // If moved more than 10px, consider it a scroll gesture
        if (deltaX > 10 || deltaY > 10) {
          hasMoved.current = true;
          setIsPressed(false);
        }
      }
    }, []);

    const handleTouchEnd = React.useCallback(() => {
      setIsPressed(false);
      // Reset after a short delay to allow click to process
      setTimeout(() => {
        hasMoved.current = false;
        touchStartPos.current = null;
      }, 100);
    }, []);

    const handleTouchCancel = React.useCallback(() => {
      setIsPressed(false);
      hasMoved.current = false;
      touchStartPos.current = null;
    }, []);

    return (
      <Comp
        className={cn(
          buttonVariants({ variant, size }),
          isPressed && !props.disabled && "opacity-80",
          className
        )}
        ref={ref}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
