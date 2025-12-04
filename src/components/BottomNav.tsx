import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { SettingsIcon, SquarePenIcon, ZapIcon } from "lucide-react";
import classNames from "classnames";
import { ReactElement } from "react";
import { useStatusStore } from "@/lib/store";
import { useHaptics } from "@/hooks/useHaptics";
import { ResponsiveContainer } from "./ResponsiveContainer";

function NavButton(props: {
  text: string;
  icon: ReactElement;
  path: string;
  isActive: boolean;
  className?: string;
  "data-tour"?: string;
}) {
  const { impact } = useHaptics();

  return (
    <div
      className={classNames(
        "inline-flex flex-col items-center justify-center",
        props.className,
      )}
      data-tour={props["data-tour"]}
    >
      <Link
        to={props.path}
        onClick={() => impact("light")}
        aria-current={props.isActive ? "page" : undefined}
        style={{
          transition: "color 0.3s, filter 0.3s",
        }}
        className="text-bd-outline flex min-h-[48px] min-w-[64px] items-center justify-center rounded-lg px-3 py-2 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none [&.active]:text-[#3faeec] [&.active]:drop-shadow-[0_0_5px_#3faeec]"
      >
        <div>
          <div className="flex justify-center drop-shadow">{props.icon}</div>
          <div className="text-center leading-4 drop-shadow">{props.text}</div>
        </div>
      </Link>
    </div>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const safeInsets = useStatusStore((state) => state.safeInsets);

  // Determine which nav item is active based on current path
  const isHome = pathname === "/";
  const isCreate = pathname.startsWith("/create");
  const isSettings = pathname.startsWith("/settings");

  return (
    <nav
      aria-label={t("nav.mainNavigation")}
      className="border-t border-t-[#ffffff21] bg-[#111928bf] backdrop-blur"
      style={{
        height: `calc(80px + ${safeInsets.bottom})`,
        paddingBottom: safeInsets.bottom,
      }}
    >
      <ResponsiveContainer maxWidth="nav" className="h-full">
        <div
          className="mx-auto grid h-full max-w-lg grid-cols-3 items-center gap-4 px-9"
          style={{
            paddingRight: `calc(2.25rem + ${safeInsets.right})`,
            paddingLeft: `calc(2.25rem + ${safeInsets.left})`,
          }}
        >
          <NavButton
            text={t("nav.index")}
            icon={<ZapIcon size="24" />}
            path="/"
            isActive={isHome}
          />
          <NavButton
            text={t("nav.create")}
            icon={<SquarePenIcon size="24" />}
            path="/create"
            isActive={isCreate}
            data-tour="nav-create"
          />
          <NavButton
            text={t("nav.settings")}
            icon={<SettingsIcon size="24" />}
            path="/settings"
            isActive={isSettings}
            data-tour="nav-settings"
          />
        </div>
      </ResponsiveContainer>
    </nav>
  );
}
