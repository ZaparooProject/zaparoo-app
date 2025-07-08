import classNames from "classnames";
import { ReactElement } from "react";

export function Toast(props: {
  icon: ReactElement;
  iconColor?: string;
  children: (ReactElement | string)[] | ReactElement | string;
}) {
  return (
    <div
      className={classNames(
        "bg-[rgba(17,25,40,0.7)]",
        "mix-blend-normal",
        "border",
        "border-solid",
        "border-[rgba(255,255,255,0.13)]",
        "shadow-md",
        "backdrop-blur",
        "rounded-[20px]",
        "w-full",
        "p-3",
        "mx-3",
        "text-foreground",
        "flex",
        "flex-row",
        "items-center",
        "gap-3"
      )}
    >
      <div
        style={{
          color: props.iconColor ? props.iconColor : ""
        }}
      >
        {props.icon}
      </div>
      <div>{props.children}</div>
    </div>
  );
}
