import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClearIcon, CreateIcon, PlayIcon } from "../lib/images";
import { CoreAPI } from "../lib/coreApi.ts";
import { Button } from "../components/wui/Button";
import { useSwipeable } from "react-swipeable";
import { useStatusStore } from "../lib/store";
import { WriteModal } from "../components/WriteModal";
import { useEffect, useRef, useState } from "react";
import { WriteAction, useNfcWriter } from "../lib/writeNfcHook";
import { PageFrame } from "../components/PageFrame";
import { useTranslation } from "react-i18next";
import { Preferences } from "@capacitor/preferences";
import { Browser } from "@capacitor/browser";
import { useQuery } from "@tanstack/react-query";
import { SlideModal } from "@/components/SlideModal.tsx";
import { TextInput } from "@/components/wui/TextInput.tsx";

const initData = {
  customText: ""
};

export const Route = createFileRoute("/create/text")({
  loader: async () => {
    initData.customText =
      (await Preferences.get({ key: "customText" })).value || "";
  },
  component: CustomText
});

function CustomText() {
  const [customText, setCustomText] = useState(initData.customText);
  const connected = useStatusStore((state) => state.connected);
  const nfcWriter = useNfcWriter();
  const [writeOpen, setWriteOpen] = useState(false);
  const closeWriteModal = () => {
    setWriteOpen(false);
    nfcWriter.end();
  };
  const safeInsets = useStatusStore((state) => state.safeInsets);
  const [systemsOpen, setSystemsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  const { t } = useTranslation();

  useEffect(() => {
    if (nfcWriter.status !== null) {
      setWriteOpen(false);
      nfcWriter.end();
    }
  }, [nfcWriter]);

  const navigate = useNavigate();
  const swipeHandlers = useSwipeable({
    onSwipedRight: () => navigate({ to: "/create" })
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPosition, setCursorPosition] = useState<number>(0);

  const insertTextAtCursor = (textToInsert: string, focus: boolean = false) => {
    const before = customText.substring(0, cursorPosition);
    const after = customText.substring(cursorPosition);
    const newText = before + textToInsert + after;
    const newPosition = cursorPosition + textToInsert.length;

    setCustomText(newText);
    setCursorPosition(newPosition); // Update cursor position state

    // Update stored value
    Preferences.set({ key: "customText", value: newText });

    if (focus) {
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPosition, newPosition);
      }, 0);
    }
  };

  return (
    <>
      <div {...swipeHandlers}>
        <PageFrame
          title={t("create.custom.title")}
          back={() => navigate({ to: "/create" })}
        >
          <div className="flex flex-col gap-3">
            <textarea
              ref={textareaRef}
              className="border border-solid border-bd-input bg-background p-3"
              placeholder={t("create.custom.textPlaceholder")}
              value={customText}
              autoCapitalize="off"
              onChange={(e) => {
                setCustomText(e.target.value);
                Preferences.set({ key: "customText", value: e.target.value });
              }}
              onSelect={(e) => {
                setCursorPosition(e.currentTarget.selectionStart);
              }}
              style={{
                resize: "none"
              }}
              rows={10}
            />

            <div>
              {t("create.custom.characters", { count: customText.length })}
            </div>

            <Button
              icon={<CreateIcon size="20" />}
              label={t("create.custom.write")}
              disabled={customText === ""}
              onClick={() => {
                if (customText !== "") {
                  nfcWriter.write(WriteAction.Write, customText);
                  setWriteOpen(true);
                }
              }}
            />

            <div className="flex flex-row gap-2">
              <Button
                icon={<PlayIcon size="20" />}
                label={t("create.custom.run")}
                onClick={() => {
                  CoreAPI.run({
                    uid: "",
                    text: customText
                  });
                }}
                variant="outline"
                disabled={customText === "" || !connected}
                className="w-full"
              />

              <Button
                icon={<ClearIcon size="20" />}
                label={t("create.custom.clear")}
                onClick={() => {
                  setCustomText("");
                  Preferences.remove({ key: "customText" });
                }}
                variant="outline"
                className="w-full"
              />
            </div>

            <Button
              label={t("settings.help.commandReference")}
              variant="outline"
              onClick={() =>
                Browser.open({
                  url: "https://zaparoo.org/docs/zapscript/"
                })
              }
            />

            <div className="flex flex-col gap-2" style={{ marginTop: "1rem" }}>
              <h2>{t("create.custom.paletteTitle")}</h2>
              <div className="flex flex-wrap gap-2">
                <Button
                  label="*"
                  variant="outline"
                  onClick={() => insertTextAtCursor("*")}
                />
                <Button
                  label="||"
                  variant="outline"
                  onClick={() => insertTextAtCursor("||")}
                />
                <Button
                  label=":"
                  variant="outline"
                  onClick={() => insertTextAtCursor(":")}
                />
                <Button
                  label=","
                  variant="outline"
                  onClick={() => insertTextAtCursor(",")}
                />
                <Button
                  label="/"
                  variant="outline"
                  onClick={() => insertTextAtCursor("/")}
                />

                <Button
                  label={t("create.custom.searchMedia")}
                  variant="outline"
                  disabled={!connected}
                  onClick={() => setSearchOpen(true)}
                />
                <Button
                  label={t("create.custom.selectSystem")}
                  variant="outline"
                  disabled={!connected}
                  onClick={() => {
                    setSystemsOpen(true);
                    systems.refetch();
                  }}
                />

                <Button
                  label="launch.system"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**launch.system:", true)}
                />
                <Button
                  label="launch.random"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**launch.random:", true)}
                />
                <Button
                  label="launch.search"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**launch.search:", true)}
                />
                <Button
                  label="input.keyboard"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**input.keyboard:", true)}
                />
                <Button
                  label="input.gamepad"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**input.gamepad:", true)}
                />
                <Button
                  label="input.coinp1"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**input.coinp1:1", true)}
                />
                <Button
                  label="input.coinp2"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**input.coinp2:1", true)}
                />
                <Button
                  label="playlist.load"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.load:", true)}
                />
                <Button
                  label="playlist.play"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.play:", true)}
                />
                <Button
                  label="playlist.stop"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.stop:", true)}
                />
                <Button
                  label="playlist.next"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.next:", true)}
                />
                <Button
                  label="playlist.previous"
                  variant="outline"
                  onClick={() =>
                    insertTextAtCursor("**playlist.previous:", true)
                  }
                />
                <Button
                  label="playlist.pause"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.pause:", true)}
                />
                <Button
                  label="playlist.goto"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.goto:", true)}
                />
                <Button
                  label="playlist.open"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**playlist.open:", true)}
                />
                <Button
                  label="mister.ini"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**mister.ini:", true)}
                />
                <Button
                  label="mister.core"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**mister.core:", true)}
                />
                <Button
                  label="mister.script"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**mister.script:", true)}
                />
                <Button
                  label="http.get"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**http.get:", true)}
                />
                <Button
                  label="http.post"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**http.post:", true)}
                />
                <Button
                  label="stop"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**stop:", true)}
                />
                <Button
                  label="execute"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**execute:", true)}
                />
                <Button
                  label="delay"
                  variant="outline"
                  onClick={() => insertTextAtCursor("**delay:", true)}
                />
              </div>
            </div>
          </div>
        </PageFrame>
      </div>
      <SlideModal
        isOpen={systemsOpen}
        close={() => setSystemsOpen(false)}
        title={t("create.custom.selectSystem")}
      >
        <div style={{ paddingBottom: safeInsets.bottom }}>
          <div className="flex flex-col gap-2">
            {systems.isLoading ? (
              <div className="p-4 text-center">{t("common.loading")}</div>
            ) : systems.error ? (
              <div className="p-4 text-center text-error">
                {t("common.error")}
              </div>
            ) : (
              [...(systems.data?.systems ?? [])]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((system) => (
                  <Button
                    key={system.id}
                    label={system.name}
                    variant="outline"
                    onClick={() => {
                      insertTextAtCursor(`${system.id}`);
                      setSystemsOpen(false);
                    }}
                  />
                ))
            )}
          </div>
        </div>
      </SlideModal>
      <WriteModal isOpen={writeOpen} close={closeWriteModal} />
      <MediaSearchModal
        isOpen={searchOpen}
        close={() => setSearchOpen(false)}
        onSelect={(path) => {
          insertTextAtCursor(path);
        }}
      />
    </>
  );
}

function MediaSearchModal(props: {
  isOpen: boolean;
  close: () => void;
  onSelect: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedSystem, setSelectedSystem] = useState<string>("all");
  const connected = useStatusStore((state) => state.connected);

  const systems = useQuery({
    queryKey: ["systems"],
    queryFn: () => CoreAPI.systems()
  });

  const gamesIndex = useStatusStore((state) => state.gamesIndex);

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300); // 300ms delay

    return () => clearTimeout(timer);
  }, [query]);

  const searchResults = useQuery({
    queryKey: ["mediaSearch", debouncedQuery, selectedSystem],
    queryFn: () =>
      CoreAPI.mediaSearch({
        query: debouncedQuery,
        systems: selectedSystem === "all" ? [] : [selectedSystem]
      }),
    enabled:
      debouncedQuery.length >= 2 &&
      connected &&
      gamesIndex.exists &&
      !gamesIndex.indexing
  });

  const safeInsets = useStatusStore((state) => state.safeInsets);

  return (
    <SlideModal
      isOpen={props.isOpen}
      close={props.close}
      title={t("create.search.title")}
    >
      <div style={{ paddingBottom: safeInsets.bottom }}>
        <div className="flex flex-col gap-4">
          <TextInput
            label={t("create.search.gameInput")}
            placeholder={t("create.search.gameInputPlaceholder")}
            value={query}
            setValue={setQuery}
            type="search"
            disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
            onKeyUp={(e) => {
              if (e.key === "Enter" || e.keyCode === 13) {
                e.currentTarget.blur();
              }
            }}
          />

          <div className="flex flex-col">
            <label className="text-white">
              {t("create.search.systemInput")}
            </label>
            <select
              value={selectedSystem}
              onChange={(e) => {
                setSelectedSystem(e.target.value);
                Preferences.set({ key: "searchSystem", value: e.target.value });
              }}
              disabled={!connected || !gamesIndex.exists || gamesIndex.indexing}
              className="rounded-md border border-solid border-bd-input bg-background p-3 text-foreground disabled:border-foreground-disabled"
            >
              <option value="all">{t("create.search.allSystems")}</option>
              {systems.isSuccess &&
                systems.data.systems
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.name}
                    </option>
                  ))}
            </select>
          </div>

          {/* Search Results */}
          <div className="flex flex-col gap-2">
            {searchResults.isLoading ? (
              <div className="flex flex-col items-center justify-center pt-3">
                <div className="text-primary">
                  <div className="lds-facebook">
                    <div></div>
                    <div></div>
                    <div></div>
                  </div>
                </div>
              </div>
            ) : searchResults.error ? (
              <p className="pt-2 text-center">
                {t("create.search.searchError")}
              </p>
            ) : (
              searchResults.data?.results.map((result) => (
                <Button
                  key={result.path}
                  variant="outline"
                  onClick={() => {
                    props.onSelect(`${result.path}`);
                    props.close();
                  }}
                  label={`${result.path}`}
                />
              ))
            )}
          </div>

          {query.length >= 2 && searchResults.data?.results.length === 0 && (
            <div className="text-center text-gray-400">
              {t("create.search.noResults")}
            </div>
          )}
        </div>
      </div>
    </SlideModal>
  );
}
