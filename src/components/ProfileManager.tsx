import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PlusIcon } from "lucide-react";
import classNames from "classnames";
import toast from "react-hot-toast";
import { CoreAPI } from "@/lib/coreApi";
import { logger } from "@/lib/logger";
import {
  type ClientRole,
  type NewProfileRequest,
  type Profile,
  type UpdateProfileRequest,
} from "@/lib/models";
import { useStatusStore } from "@/lib/store";
import { Button } from "@/components/wui/Button";
import { Badge } from "@/components/wui/Badge";
import { EmptyState } from "@/components/wui/EmptyState";
import { Segmented } from "@/components/wui/Segmented";
import { TextInput } from "@/components/wui/TextInput";
import { ToggleSwitch } from "@/components/wui/ToggleSwitch";
import { SettingHelp } from "@/components/wui/SettingHelp";
import { SlideModal } from "@/components/SlideModal";
import { NextIcon } from "@/lib/images";
import { formatDuration, parseDuration } from "@/lib/utils";
import { useHapticPress } from "@/hooks/useHapticPress";

const PROFILE_QUERY_KEY = ["profiles"];
const ACTIVE_PROFILE_QUERY_KEY = ["profiles", "active"];
const PIN_PATTERN = /^\d{4,8}$/;

type LimitsMode = "inherit" | "on" | "off";
type PinMode = "keep" | "change" | "remove";
type EditorAction = "create" | "edit";

interface EditorState {
  action: EditorAction;
  profile: Profile | null;
  name: string;
  role: ClientRole;
  pin: string;
  pinMode: PinMode;
  limitsMode: LimitsMode;
  dailyHours: string;
  dailyMinutes: string;
  sessionHours: string;
  sessionMinutes: string;
}

function editorState(
  profile: Profile | null,
  firstProfile: boolean,
): EditorState {
  return {
    action: profile ? "edit" : "create",
    profile,
    name: profile?.name ?? "",
    role: profile?.role ?? (firstProfile ? "admin" : "member"),
    pin: "",
    pinMode: profile?.hasPin ? "keep" : "change",
    limitsMode:
      profile?.limitsEnabled === undefined
        ? "inherit"
        : profile.limitsEnabled
          ? "on"
          : "off",
    dailyHours: String(parseDuration(profile?.dailyLimit ?? "0").hours),
    dailyMinutes: String(parseDuration(profile?.dailyLimit ?? "0").minutes),
    sessionHours: String(parseDuration(profile?.sessionLimit ?? "0").hours),
    sessionMinutes: String(parseDuration(profile?.sessionLimit ?? "0").minutes),
  };
}

function limitsEnabled(mode: LimitsMode): boolean | undefined {
  if (mode === "inherit") return undefined;
  return mode === "on";
}

function isValidDurationPart(value: string, max?: number): boolean {
  if (!/^\d+$/.test(value)) return false;
  const parsed = Number(value);
  return (
    Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    (max === undefined || parsed <= max)
  );
}

function editorDuration(hours: string, minutes: string): string {
  return formatDuration({
    hours: Number(hours),
    minutes: Number(minutes),
  });
}

function formatLastUsed(timestamp: number | undefined, never: string): string {
  if (!timestamp) return never;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(timestamp * 1000),
  );
}

function ProfileRow(props: {
  profile: Profile;
  active: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { profile } = props;
  const handleHapticPress = useHapticPress();

  return (
    <button
      type="button"
      onPointerUp={handleHapticPress}
      onClick={props.onOpen}
      className="border-bd-outline flex w-full flex-row items-center justify-between gap-3 border-b border-solid px-1 py-3 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none"
      aria-label={t("settings.core.profiles.openProfile", {
        name: profile.name,
      })}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{profile.name}</span>
          {props.active && (
            <Badge variant="success">
              {t("settings.core.profiles.active")}
            </Badge>
          )}
          <Badge>{t(`settings.core.profiles.role.${profile.role}`)}</Badge>
        </span>
        <span className="text-muted-foreground text-sm">
          {t("settings.core.profiles.lastUsed", {
            date: formatLastUsed(
              profile.lastUsedAt,
              t("settings.core.profiles.neverUsed"),
            ),
          })}
        </span>
      </span>
      <span aria-hidden="true" className="text-muted-foreground shrink-0">
        <NextIcon size="20" />
      </span>
    </button>
  );
}

export function ProfileManager(props: {
  connected: boolean;
  canManage: boolean;
  canWriteSettings: boolean;
  requireForLaunch: boolean;
  settingsLoading: boolean;
  onRequireForLaunchChange: (value: boolean) => void;
  available: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setWriteQueue = useStatusStore((state) => state.setWriteQueue);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [switchProfile, setSwitchProfile] = useState<Profile | "shared" | null>(
    null,
  );
  const [switchPin, setSwitchPin] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [resetCardTarget, setResetCardTarget] = useState<Profile | null>(null);

  const profilesQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: () => CoreAPI.profiles(),
    enabled: props.connected && props.available,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });
  const activeQuery = useQuery({
    queryKey: ACTIVE_PROFILE_QUERY_KEY,
    queryFn: () => CoreAPI.activeProfile(),
    enabled: props.connected && props.available,
    refetchOnMount: "always",
    refetchInterval: 30000,
  });

  const profiles = profilesQuery.data?.profiles ?? [];
  const hasAdmin = profiles.some((profile) => profile.role === "admin");
  const adminCount = profiles.filter(
    (profile) => profile.role === "admin",
  ).length;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: ACTIVE_PROFILE_QUERY_KEY }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      const name = state.name.trim();
      const pin = state.pin.trim();
      const dailyLimit = editorDuration(state.dailyHours, state.dailyMinutes);
      const sessionLimit = editorDuration(
        state.sessionHours,
        state.sessionMinutes,
      );
      const enabled = limitsEnabled(state.limitsMode);

      if (state.action === "create") {
        const request: NewProfileRequest = { name, role: state.role };
        if (pin) request.pin = pin;
        if (enabled !== undefined) request.limitsEnabled = enabled;
        if (enabled === true) {
          request.dailyLimit = dailyLimit;
          request.sessionLimit = sessionLimit;
        }
        return CoreAPI.newProfile(request);
      }

      const request: UpdateProfileRequest = {
        profileId: state.profile!.profileId,
        name,
        role: state.role,
        clearLimits: true,
      };
      if (state.pinMode === "change" && pin) request.pin = pin;
      if (state.pinMode === "remove") request.clearPin = true;
      if (enabled !== undefined) request.limitsEnabled = enabled;
      if (enabled === true) {
        request.dailyLimit = dailyLimit;
        request.sessionLimit = sessionLimit;
      }
      return CoreAPI.updateProfile(request);
    },
    onSuccess: async () => {
      toast.success(t("settings.core.profiles.saved"));
      setEditor(null);
      await refresh();
    },
    onError: (error) => {
      logger.error("Failed to save profile", error, {
        category: "api",
        action: "saveProfile",
        severity: "error",
      });
      toast.error(t("settings.core.profiles.saveFailed"));
    },
  });

  const resetCardMutation = useMutation({
    mutationFn: (profileId: string) =>
      CoreAPI.updateProfile({ profileId, regenerateSwitchId: true }),
    onSuccess: async () => {
      toast.success(t("settings.core.profiles.cardReset"));
      setResetCardTarget(null);
      await refresh();
    },
    onError: (error) => {
      logger.error("Failed to reset profile switch ID", error, {
        category: "api",
        action: "resetProfileCard",
        severity: "error",
      });
      toast.error(t("settings.core.profiles.cardResetFailed"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (profileId: string) => CoreAPI.deleteProfile(profileId),
    onSuccess: async () => {
      toast.success(t("settings.core.profiles.deleted"));
      setDeleteTarget(null);
      await refresh();
    },
    onError: (error) => {
      logger.error("Failed to delete profile", error, {
        category: "api",
        action: "deleteProfile",
        severity: "error",
      });
      toast.error(t("settings.core.profiles.deleteFailed"));
    },
  });

  const switchMutation = useMutation({
    mutationFn: () => {
      if (switchProfile === "shared") return CoreAPI.switchProfile();
      if (!switchProfile) return Promise.resolve(null);
      return CoreAPI.switchProfile({
        profileId: switchProfile.profileId,
        ...(switchProfile.hasPin ? { pin: switchPin } : {}),
      });
    },
    onSuccess: async () => {
      toast.success(t("settings.core.profiles.switched"));
      selectSwitchProfile(null);
      await refresh();
    },
    onError: (error) => {
      logger.error("Failed to switch profile", error, {
        category: "api",
        action: "switchProfile",
        severity: "error",
      });
      toast.error(t("settings.core.profiles.switchFailed"));
    },
  });

  const selectSwitchProfile = (profile: Profile | "shared" | null) => {
    setSwitchPin("");
    setSwitchProfile(profile);
  };

  const validationError = useMemo(() => {
    if (!editor) return null;
    if (!editor.name.trim()) return t("settings.core.profiles.nameRequired");
    if (editor.pin && !PIN_PATTERN.test(editor.pin)) {
      return t("settings.core.profiles.pinInvalid");
    }
    const adminNeedsPin =
      editor.role === "admin" &&
      !editor.pin &&
      (editor.action === "create" ||
        !editor.profile?.hasPin ||
        editor.pinMode !== "keep");
    if (adminNeedsPin) return t("settings.core.profiles.adminPinRequired");
    if (
      !isValidDurationPart(editor.dailyHours) ||
      !isValidDurationPart(editor.dailyMinutes, 59) ||
      !isValidDurationPart(editor.sessionHours) ||
      !isValidDurationPart(editor.sessionMinutes, 59)
    ) {
      return t("settings.core.profiles.durationInvalid");
    }
    return null;
  }, [editor, t]);

  if (!props.available) return null;

  const openNew = () => setEditor(editorState(null, profiles.length === 0));
  const openEdit = (profile: Profile) => setEditor(editorState(profile, false));
  const setEditorValue = <K extends keyof EditorState>(
    key: K,
    value: EditorState[K],
  ) => setEditor((current) => (current ? { ...current, [key]: value } : null));
  const soleAdmin =
    editor?.action === "edit" &&
    editor.profile?.role === "admin" &&
    adminCount === 1;
  const editorPinRequired =
    editor?.role === "admin" &&
    (editor.action === "create" ||
      !editor.profile?.hasPin ||
      editor.pinMode !== "keep");
  const showPinInput =
    editor?.action === "create" ||
    !editor?.profile?.hasPin ||
    editor?.pinMode === "change";
  const selectedSwitchNeedsPin =
    switchProfile !== null &&
    switchProfile !== "shared" &&
    switchProfile.hasPin;
  const canSubmitSwitch =
    switchProfile !== null &&
    (!selectedSwitchNeedsPin || PIN_PATTERN.test(switchPin));
  const selectedProfileId =
    switchProfile !== null && switchProfile !== "shared"
      ? switchProfile.profileId
      : null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-foreground text-lg font-semibold">
        {t("settings.core.profiles.title")}
      </h2>

      <ToggleSwitch
        label={
          <span className="flex items-center">
            {t("settings.core.profiles.requireForLaunch")}
            <SettingHelp
              title={t("settings.core.profiles.requireForLaunch")}
              description={t("settings.core.profiles.requireForLaunchHelp")}
            />
          </span>
        }
        value={props.requireForLaunch}
        setValue={props.onRequireForLaunchChange}
        disabled={!props.canWriteSettings}
        loading={props.settingsLoading || profilesQuery.isPending}
      />

      {profilesQuery.isPending ? null : profilesQuery.isError ? (
        <EmptyState
          size="compact"
          title={t("settings.core.profiles.loadFailed")}
          action={
            <Button
              label={t("retry")}
              variant="outline"
              size="sm"
              onClick={() => void profilesQuery.refetch()}
            />
          }
        />
      ) : profiles.length === 0 ? (
        <EmptyState
          size="compact"
          title={t("settings.core.profiles.empty")}
          action={
            props.canManage ? (
              <Button
                icon={<PlusIcon size={20} />}
                label={t("settings.core.profiles.add")}
                intent="primary"
                onClick={openNew}
              />
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col">
          {profiles.map((profile) => (
            <ProfileRow
              key={profile.profileId}
              profile={profile}
              active={activeQuery.data?.profileId === profile.profileId}
              onOpen={() =>
                props.canManage
                  ? openEdit(profile)
                  : selectSwitchProfile(profile)
              }
            />
          ))}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="flex gap-2">
          {props.canManage && (
            <Button
              icon={<PlusIcon size={20} />}
              label={t("settings.core.profiles.add")}
              intent="primary"
              className="flex-1"
              onClick={openNew}
            />
          )}
          <Button
            label={t("settings.core.profiles.switch")}
            variant="outline"
            className="flex-1"
            onClick={() => selectSwitchProfile("shared")}
          />
        </div>
      )}

      {!props.canManage && profiles.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {t("settings.core.profiles.adminRequired")}
        </p>
      )}

      <SlideModal
        isOpen={editor !== null}
        close={() => setEditor(null)}
        title={t(
          editor?.action === "edit"
            ? "settings.core.profiles.edit"
            : "settings.core.profiles.new",
        )}
        footer={
          editor && (
            <div className="flex gap-2 pt-3">
              {editor.action === "edit" && (
                <Button
                  label={t("settings.core.profiles.delete")}
                  variant="outline"
                  intent="destructive"
                  className="border-error text-error flex-1"
                  onClick={() => {
                    setDeleteTarget(editor.profile);
                    setEditor(null);
                  }}
                  disabled={saveMutation.isPending || deleteMutation.isPending}
                />
              )}
              <Button
                label={t("save")}
                intent="primary"
                className="flex-1"
                onClick={() => editor && saveMutation.mutate(editor)}
                disabled={validationError !== null || saveMutation.isPending}
              />
            </div>
          )
        }
      >
        {editor && (
          <div className="flex flex-col gap-4 py-4">
            <TextInput
              label={t("settings.core.profiles.nameRequiredLabel")}
              value={editor.name}
              setValue={(value) => setEditorValue("name", value)}
              maxLength={255}
              required
              error={
                editor.name.length > 0 && !editor.name.trim()
                  ? t("settings.core.profiles.nameRequired")
                  : undefined
              }
            />
            <Segmented
              label={t("settings.core.profiles.roleLabel")}
              options={[
                {
                  value: "admin",
                  label: t("settings.core.profiles.role.admin"),
                },
                {
                  value: "member",
                  label: t("settings.core.profiles.role.member"),
                },
              ]}
              value={editor.role}
              onChange={(value) => {
                setEditorValue("role", value);
                if (value === "admin" && editor.pinMode === "remove") {
                  setEditorValue("pinMode", "keep");
                }
              }}
              disabled={(!hasAdmin && editor.action === "create") || soleAdmin}
              help={
                !hasAdmin && editor.action === "create"
                  ? t("settings.core.profiles.firstAdminHelp")
                  : soleAdmin
                    ? t("settings.core.profiles.soleAdminHelp")
                    : t("settings.core.profiles.roleHelp")
              }
            />
            {editor.action === "edit" && editor.profile?.hasPin && (
              <Segmented
                label={t("settings.core.profiles.pinAction")}
                options={[
                  {
                    value: "keep",
                    label: t("settings.core.profiles.pinKeep"),
                  },
                  {
                    value: "change",
                    label: t("settings.core.profiles.pinChange"),
                  },
                  ...(editor.role === "member"
                    ? [
                        {
                          value: "remove" as const,
                          label: t("settings.core.profiles.pinRemove"),
                        },
                      ]
                    : []),
                ]}
                value={editor.pinMode}
                onChange={(value) => {
                  setEditorValue("pinMode", value);
                  setEditorValue("pin", "");
                }}
              />
            )}
            {showPinInput && (
              <TextInput
                label={t(
                  editorPinRequired
                    ? "settings.core.profiles.pinRequiredLabel"
                    : "settings.core.profiles.pinOptionalLabel",
                )}
                value={editor.pin}
                setValue={(value) =>
                  setEditorValue("pin", value.replace(/\D/g, "").slice(0, 8))
                }
                type="password"
                inputMode="numeric"
                maxLength={8}
                min={1000}
                max={99999999}
                required={editorPinRequired}
                autoComplete="new-password"
                error={
                  editor.pin.length > 0 && !PIN_PATTERN.test(editor.pin)
                    ? t("settings.core.profiles.pinInvalid")
                    : undefined
                }
              />
            )}
            <Segmented
              label={t("settings.core.profiles.limits")}
              options={[
                {
                  value: "inherit",
                  label: t("settings.core.profiles.limitsInherit"),
                },
                {
                  value: "on",
                  label: t("settings.core.profiles.limitsOn"),
                },
                {
                  value: "off",
                  label: t("settings.core.profiles.limitsOff"),
                },
              ]}
              value={editor.limitsMode}
              onChange={(value) => setEditorValue("limitsMode", value)}
            />
            {editor.limitsMode === "on" && (
              <div className="flex flex-col gap-3">
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">
                    {t("settings.core.profiles.dailyLimit")}
                  </legend>
                  <div className="flex gap-2">
                    <TextInput
                      label={t("settings.core.playtime.hours")}
                      className="min-w-0 flex-1"
                      value={editor.dailyHours}
                      setValue={(value) => setEditorValue("dailyHours", value)}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                    />
                    <TextInput
                      label={t("settings.core.playtime.minutes")}
                      className="min-w-0 flex-1"
                      value={editor.dailyMinutes}
                      setValue={(value) =>
                        setEditorValue("dailyMinutes", value)
                      }
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      step={1}
                    />
                  </div>
                </fieldset>
                <fieldset className="flex flex-col gap-2">
                  <legend className="text-sm font-medium">
                    {t("settings.core.profiles.sessionLimit")}
                  </legend>
                  <div className="flex gap-2">
                    <TextInput
                      label={t("settings.core.playtime.hours")}
                      className="min-w-0 flex-1"
                      value={editor.sessionHours}
                      setValue={(value) =>
                        setEditorValue("sessionHours", value)
                      }
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                    />
                    <TextInput
                      label={t("settings.core.playtime.minutes")}
                      className="min-w-0 flex-1"
                      value={editor.sessionMinutes}
                      setValue={(value) =>
                        setEditorValue("sessionMinutes", value)
                      }
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={59}
                      step={1}
                    />
                  </div>
                </fieldset>
                <p className="text-muted-foreground text-xs">
                  {t("settings.core.profiles.unlimitedHelp")}
                </p>
              </div>
            )}
            {editor.action === "edit" && editor.profile?.switchId && (
              <div className="border-bd-filled flex flex-col gap-4 border-t pt-4">
                <div className="flex flex-col gap-2">
                  <div>
                    <h3 className="font-medium">
                      {t("settings.core.profiles.writeCard")}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t("settings.core.profiles.writeCardHelp")}
                    </p>
                  </div>
                  <Button
                    label={t("settings.core.profiles.writeCard")}
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setEditor(null);
                      setWriteQueue(`**profile:${editor.profile!.switchId}`);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div>
                    <h3 className="font-medium">
                      {t("settings.core.profiles.resetCards")}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t("settings.core.profiles.resetCardsHelp")}
                    </p>
                  </div>
                  <Button
                    label={t("settings.core.profiles.resetCards")}
                    variant="outline"
                    intent="destructive"
                    className="border-error text-error w-full"
                    onClick={() => {
                      setResetCardTarget(editor.profile);
                      setEditor(null);
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </SlideModal>

      <SlideModal
        isOpen={deleteTarget !== null}
        close={() => setDeleteTarget(null)}
        title={t("settings.core.profiles.deleteTitle")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">
            {t("settings.core.profiles.deleteConfirm", {
              name: deleteTarget?.name,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              label={t("nav.cancel")}
              variant="outline"
              className="flex-1"
              onClick={() => setDeleteTarget(null)}
            />
            <Button
              label={t("settings.core.profiles.delete")}
              variant="outline"
              intent="destructive"
              className="border-error text-error flex-1"
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.profileId)
              }
              disabled={deleteMutation.isPending}
            />
          </div>
        </div>
      </SlideModal>

      <SlideModal
        isOpen={resetCardTarget !== null}
        close={() => setResetCardTarget(null)}
        title={t("settings.core.profiles.resetCardsTitle")}
      >
        <div className="flex flex-col gap-4 py-4">
          <p className="text-center">
            {t("settings.core.profiles.resetCardsConfirm", {
              name: resetCardTarget?.name,
            })}
          </p>
          <div className="flex gap-2">
            <Button
              label={t("nav.cancel")}
              variant="outline"
              className="flex-1"
              onClick={() => setResetCardTarget(null)}
            />
            <Button
              label={t("settings.core.profiles.resetCards")}
              variant="outline"
              intent="destructive"
              className="border-error text-error flex-1"
              onClick={() =>
                resetCardTarget &&
                resetCardMutation.mutate(resetCardTarget.profileId)
              }
              disabled={resetCardMutation.isPending}
            />
          </div>
        </div>
      </SlideModal>

      <SlideModal
        isOpen={switchProfile !== null}
        close={() => selectSwitchProfile(null)}
        title={t("settings.core.profiles.switch")}
      >
        <div className="flex flex-col gap-3 py-4">
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => selectSwitchProfile("shared")}
              aria-pressed={switchProfile === "shared"}
              className={classNames(
                "border-bd-outline flex min-h-12 items-center justify-between border-b border-solid px-1 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                { "bg-white/10": switchProfile === "shared" },
              )}
            >
              <span>{t("settings.core.profiles.shared")}</span>
              {activeQuery.data === null && (
                <Badge variant="success">
                  {t("settings.core.profiles.active")}
                </Badge>
              )}
            </button>
            {profiles.map((profile) => (
              <button
                type="button"
                key={profile.profileId}
                onClick={() => selectSwitchProfile(profile)}
                aria-pressed={selectedProfileId === profile.profileId}
                className={classNames(
                  "border-bd-outline flex min-h-12 items-center justify-between border-b border-solid px-1 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:outline-none",
                  {
                    "bg-white/10": selectedProfileId === profile.profileId,
                  },
                )}
              >
                <span>{profile.name}</span>
                {activeQuery.data?.profileId === profile.profileId && (
                  <Badge variant="success">
                    {t("settings.core.profiles.active")}
                  </Badge>
                )}
              </button>
            ))}
          </div>
          {selectedSwitchNeedsPin && (
            <TextInput
              label={t("settings.core.profiles.pin")}
              value={switchPin}
              setValue={(value) =>
                setSwitchPin(value.replace(/\D/g, "").slice(0, 8))
              }
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="current-password"
            />
          )}
          <Button
            label={t("settings.core.profiles.switch")}
            intent="primary"
            className="w-full"
            onClick={() => switchMutation.mutate()}
            disabled={!canSubmitSwitch || switchMutation.isPending}
          />
        </div>
      </SlideModal>
    </section>
  );
}
