import { useEffect, useMemo, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { BackToTop } from "@/components/BackToTop";
import { PageFrame } from "@/components/PageFrame";
import { EmptyState } from "@/components/wui/EmptyState";
import { HeaderButton } from "@/components/wui/HeaderButton";
import { Button } from "@/components/wui/Button";
import { TextInput } from "@/components/wui/TextInput";
import { usePageHeadingFocus } from "@/hooks/usePageHeadingFocus";
import { useSmartSwipe } from "@/hooks/useSmartSwipe";
import licenseDataJson from "@/generated/thirdPartyLicenses.json";
import { BackIcon, ExternalIcon } from "@/lib/images";
import { logger } from "@/lib/logger";

interface ThirdPartyPackage {
  name: string;
  version: string;
  license: string;
  repository: string;
  noticeId: string;
}

interface ThirdPartyLicenseData {
  noticesFile: string;
  packages: ThirdPartyPackage[];
}

interface ThirdPartyLicenseNotices {
  notices: Record<string, string>;
}

type NoticeLoadState =
  | { status: "idle" | "loading" | "error" }
  | { status: "loaded"; notices: Record<string, string> };

const licenseData = licenseDataJson as ThirdPartyLicenseData;
const noticesUrl = `${__APP_BASE_PATH__.replace(/\/?$/, "/")}${licenseData.noticesFile}`;

function isThirdPartyLicenseNotices(
  value: unknown,
): value is ThirdPartyLicenseNotices {
  if (typeof value !== "object" || value === null || !("notices" in value)) {
    return false;
  }

  const { notices } = value;
  return (
    typeof notices === "object" &&
    notices !== null &&
    Object.values(notices).every((notice) => typeof notice === "string")
  );
}

export const Route = createFileRoute("/settings/licenses")({
  component: ThirdPartyLicenses,
});

export function ThirdPartyLicenses() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [expandedPackage, setExpandedPackage] = useState("");
  const [noticeLoadState, setNoticeLoadState] = useState<NoticeLoadState>({
    status: "idle",
  });
  const requestController = useRef<AbortController | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headingRef = usePageHeadingFocus<HTMLHeadingElement>(
    t("settings.licenses.title"),
  );
  const router = useRouter();
  const goBack = () => router.history.back();
  const swipeHandlers = useSmartSwipe({
    onSwipeRight: goBack,
    preventScrollOnSwipe: false,
  });

  const filteredPackages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return licenseData.packages;

    return licenseData.packages.filter((packageInfo) =>
      [packageInfo.name, packageInfo.license]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [query]);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  const loadNotices = async () => {
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setNoticeLoadState({ status: "loading" });

    try {
      const response = await fetch(noticesUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`License notice request failed: ${response.status}`);
      }

      const data: unknown = await response.json();
      if (!isThirdPartyLicenseNotices(data)) {
        throw new Error("License notice data is invalid");
      }

      setNoticeLoadState({ status: "loaded", notices: data.notices });
    } catch (error) {
      if (controller.signal.aborted) return;

      logger.error("Failed to load third-party license notices", error, {
        category: "general",
        action: "loadThirdPartyLicenses",
        severity: "error",
      });
      setNoticeLoadState({ status: "error" });
    }
  };

  const handleExpandedPackageChange = (value: string) => {
    setExpandedPackage(value);
    if (value && noticeLoadState.status === "idle") {
      void loadNotices();
    }
  };

  return (
    <>
      <PageFrame
        {...swipeHandlers}
        scrollRef={scrollContainerRef}
        headerLeft={
          <HeaderButton
            onClick={goBack}
            icon={<BackIcon size="24" />}
            aria-label={t("nav.back")}
          />
        }
        headerCenter={
          <h1 ref={headingRef} className="text-foreground text-xl">
            {t("settings.licenses.title")}
          </h1>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            {t("settings.licenses.description")}
          </p>

          <TextInput
            label={t("settings.licenses.searchLabel")}
            placeholder={t("settings.licenses.searchPlaceholder")}
            type="search"
            inputMode="search"
            value={query}
            setValue={setQuery}
            clearable
          />

          <p className="text-muted-foreground text-sm" aria-live="polite">
            {t("settings.licenses.packageCount", {
              count: filteredPackages.length,
            })}
          </p>

          {filteredPackages.length === 0 ? (
            <EmptyState
              title={t("settings.licenses.noResults")}
              size="compact"
            />
          ) : (
            <Accordion
              type="single"
              collapsible
              value={expandedPackage}
              onValueChange={handleExpandedPackageChange}
            >
              {filteredPackages.map((packageInfo) => {
                const noticeText =
                  noticeLoadState.status === "loaded"
                    ? noticeLoadState.notices[packageInfo.noticeId]
                    : undefined;
                const hasNotice = Boolean(noticeText?.trim());

                return (
                  <AccordionItem
                    key={`${packageInfo.name}@${packageInfo.version}`}
                    value={`${packageInfo.name}@${packageInfo.version}`}
                    className="border-bd-outline last:border-b-0"
                  >
                    <AccordionTrigger className="gap-3 no-underline hover:no-underline">
                      <span className="flex min-w-0 flex-col">
                        <span className="text-foreground break-all">
                          {packageInfo.name}
                        </span>
                        <span className="text-muted-foreground text-xs font-normal">
                          {packageInfo.version} · {packageInfo.license}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-3">
                      {packageInfo.repository && (
                        <Button
                          label={t("settings.licenses.projectWebsite")}
                          variant="outline"
                          size="sm"
                          icon={<ExternalIcon size="16" />}
                          className="self-start"
                          onClick={() =>
                            Browser.open({ url: packageInfo.repository })
                          }
                        />
                      )}
                      {noticeLoadState.status === "loaded" && hasNotice && (
                        <pre className="text-muted-foreground overflow-x-auto font-mono text-xs break-words whitespace-pre-wrap">
                          {noticeText}
                        </pre>
                      )}
                      {noticeLoadState.status === "loaded" && !hasNotice && (
                        <EmptyState
                          title={t("settings.licenses.missingNotice")}
                          size="compact"
                        />
                      )}
                      {noticeLoadState.status === "loading" && (
                        <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
                          <LoadingSpinner size={18} />
                          <span>{t("settings.licenses.loading")}</span>
                        </div>
                      )}
                      {noticeLoadState.status === "error" && (
                        <EmptyState
                          title={t("settings.licenses.loadError")}
                          size="compact"
                          action={
                            <Button
                              label={t("settings.licenses.retry")}
                              variant="outline"
                              size="sm"
                              onClick={() => void loadNotices()}
                            />
                          }
                        />
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </PageFrame>
      <BackToTop
        scrollContainerRef={scrollContainerRef}
        threshold={200}
        bottomOffset="calc(var(--bottom-nav-base-height) + 1rem)"
      />
    </>
  );
}
