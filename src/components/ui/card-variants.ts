import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "drop-shadow rounded-xl border border-solid p-3 transition-all duration-100",
  {
    variants: {
      variant: {
        default: "border-[hsl(var(--border))] bg-card text-card-foreground",
        wui: "border-[rgba(255,255,255,0.13)] bg-wui-card text-white",
        outline: "border-[hsl(var(--border))] bg-transparent text-foreground",
      },
      clickable: {
        true: "cursor-pointer hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      clickable: false,
    },
  },
);
