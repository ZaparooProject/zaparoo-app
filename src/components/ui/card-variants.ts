import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "wui-card rounded-lg border border-solid p-3 transition-all duration-100",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        wui: "border-border bg-wui-card text-foreground",
        outline: "border-border bg-transparent text-foreground",
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
