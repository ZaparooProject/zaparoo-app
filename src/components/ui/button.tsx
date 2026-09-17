import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 min-h-12 min-w-12 border border-transparent text-sm font-bold tracking-wider uppercase transition-all duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 touch-manipulation",
  {
    variants: {
      variant: {
        default: "site-button site-button-primary",
        wui: "site-button site-button-primary",
        destructive: "site-button site-button-destructive",
        outline: "site-button site-button-outline",
        "wui-outline": "site-button site-button-secondary",
        secondary: "site-button site-button-secondary",
        ghost: "hover:bg-foreground/10 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-12 px-5 py-3 rounded-md",
        sm: "min-h-12 px-4 py-2 rounded-md",
        lg: "min-h-14 px-7 py-3.5 text-base rounded-md",
        icon: "size-12 p-2 rounded-full",
        "icon-sm": "size-12 p-2 rounded-full",
        "icon-lg": "size-14 p-3 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const [isPressed, setIsPressed] = React.useState(false);
    const touchStartPos = React.useRef<{ x: number; y: number } | null>(null);
    const hasMoved = React.useRef(false);

    const Comp = asChild ? Slot : "button";

    const handleClick = React.useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        // Only trigger click if this wasn't a scroll gesture
        if (!hasMoved.current && !props.disabled && onClick) {
          onClick(e);
        }
      },
      [onClick, props.disabled],
    );

    const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
      hasMoved.current = false;
      setIsPressed(true);
    }, []);

    const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
      if (touchStartPos.current) {
        const touch = e.touches[0];
        if (!touch) return;
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

          className,
        )}
        data-pressed={isPressed && !props.disabled}
        data-icon-only={size?.startsWith("icon")}
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
  },
);
Button.displayName = "Button";

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
