export enum Method {
  Run = "run",
  Confirm = "confirm",
  Stop = "stop",
  Tokens = "tokens",
  History = "tokens.history",
  Media = "media",
  MediaSearch = "media.search",
  MediaBrowse = "media.browse",
  MediaBrowseIndex = "media.browse.index",
  MediaMeta = "media.meta",
  MediaImage = "media.image",
  MediaGenerate = "media.generate",
  MediaGenerateCancel = "media.generate.cancel",
  MediaGenerateResume = "media.generate.resume",
  MediaCleanOrphans = "media.clean.orphans",
  MediaActive = "media.active",
  MediaActiveUpdate = "media.active.update",
  MediaControl = "media.control",
  MediaTags = "media.tags",
  MediaTagsUpdate = "media.tags.update",
  Systems = "systems",
  Settings = "settings",
  SettingsUpdate = "settings.update",
  SettingsReload = "settings.reload",
  SettingsAuthClaim = "settings.auth.claim",
  SettingsAuthStatus = "settings.auth.status",
  SettingsBackupStatus = "settings.backup.status",
  SettingsLogsDownload = "settings.logs.download",
  LaunchersRefresh = "launchers.refresh",
  Mappings = "mappings",
  MappingsNew = "mappings.new",
  MappingsDelete = "mappings.delete",
  MappingsUpdate = "mappings.update",
  MappingsReload = "mappings.reload",
  Readers = "readers",
  ReadersWrite = "readers.write",
  ReadersWriteCancel = "readers.write.cancel",
  Version = "version",
  Playtime = "playtime",
  PlaytimeLimits = "settings.playtime.limits",
  PlaytimeLimitsUpdate = "settings.playtime.limits.update",
  Inbox = "inbox",
  InboxDelete = "inbox.delete",
  InboxClear = "inbox.clear",
  ClientsCurrent = "clients.current",
  Scrapers = "scrapers",
  MediaScrape = "media.scrape",
  MediaScrapeStatus = "media.scrape.status",
  MediaScrapeCancel = "media.scrape.cancel",
  MediaScrapeResume = "media.scrape.resume",
  InputKeyboard = "input.keyboard",
  InputGamepad = "input.gamepad",
  Screenshot = "screenshot",
}

export enum Notification {
  ReadersConnected = "readers.added",
  ReadersDisconnected = "readers.removed",
  TokensLaunching = "running",
  TokensScanned = "tokens.added",
  TokensRemoved = "tokens.removed",
  TokensStaged = "tokens.staged",
  TokensStagedReady = "tokens.staged.ready",
  MediaStarted = "media.started",
  MediaStopped = "media.stopped",
  MediaIndexing = "media.indexing",
  PlaytimeLimitWarning = "playtime.limit.warning",
  PlaytimeLimitReached = "playtime.limit.reached",
  InboxAdded = "inbox.added",
  MediaScraping = "media.scraping",
  ClientsPaired = "clients.paired",
}

export interface VersionResponse {
  version: string;
  platform: string;
}

export type ClientRole = "admin" | "member";

export enum ClientCapability {
  ProfilesManage = "profiles.manage",
  SettingsWrite = "settings.write",
}

export interface ClientsCurrentResponse {
  paired: boolean;
  role: ClientRole | null;
  capabilities: string[];
}

export interface LaunchRequest {
  type?: string;
  uid?: string;
  text?: string;
  data?: string;
  unsafe?: boolean;
}

export interface WriteRequest {
  text: string;
}

export interface InputKeyboardRequest {
  keys: string;
}

export interface InputGamepadRequest {
  buttons: string;
}

export interface SettingsAuthClaimRequest {
  claimUrl: string;
  token: string;
}

export interface SettingsAuthClaimResponse {
  domains: string[];
}

export interface SettingsAuthStatusRequest {
  url: string;
}

export interface SettingsAuthStatusResponse {
  linked: boolean;
}

export interface BackupCategoryStatus {
  files: number;
  bytes: number;
  enabled: boolean;
}

export interface BackupWarning {
  category: string;
  path: string;
  reason: string;
}

export interface BackupStatusEntry {
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastSnapshotCreatedAt?: string;
  availabilityCheckedAt?: string;
  deviceName?: string;
  linkedAt?: string;
  categories?: Record<string, BackupCategoryStatus>;
  schedule?: "daily" | "weekly" | "manual";
  lastError?: string;
  availability?: "available" | "unavailable" | "unknown";
  lastStatus: string;
  warnings?: BackupWarning[];
  lastBackupSize: number;
  skippedFiles?: number;
  linked?: boolean;
  enabled: boolean;
  lastRunNoChanges?: boolean;
}

export interface BackupStatusResponse {
  activeSince?: string;
  activeOperation?: string;
  local: BackupStatusEntry;
  remote: BackupStatusEntry;
}

export interface DeviceClaimResponse {
  claim_url: string;
  token: string;
  expires_at: string;
}

export interface ScreenshotResponse {
  path: string;
  data: string;
  size: number;
}

export interface SearchParams {
  query: string;
  systems: string[];
  maxResults?: number;
  tags?: string[];
  cursor?: string;
}

export interface TagInfo {
  tag: string;
  type: string;
  label?: string;
}

export type MediaBrowseEntryType = "root" | "directory" | "media";
export type MediaBrowseSort =
  | "name-asc"
  | "name-desc"
  | "filename-asc"
  | "filename-desc";

export interface MediaBrowseParams {
  path?: string;
  systems?: string[];
  maxResults?: number;
  cursor?: string;
  letter?: string;
  sort?: MediaBrowseSort;
}

export interface MediaBrowseEntry {
  mediaId?: number;
  name: string;
  path: string;
  type: MediaBrowseEntryType;
  fileCount?: number;
  systemId?: string;
  systemIds?: string[];
  systemName?: string;
  zapScript?: string;
  relativePath?: string;
  group?: string;
  description?: string;
  tags?: TagInfo[];
  disambiguatingTags?: TagInfo[];
  hasCover?: boolean;
}

export interface MediaBrowseResponse {
  path: string;
  entries: MediaBrowseEntry[];
  totalFiles: number;
  totalDirs?: number;
  pagination?: Pagination;
}

export interface MediaBrowseIndexParams {
  path?: string;
  systems?: string[];
  sort?: MediaBrowseSort;
}

export interface MediaBrowseIndexGroup {
  key: string;
  label: string;
  count: number;
  cursor: string;
  offset: number;
}

export interface MediaBrowseIndexResponse {
  scheme: string;
  totalFiles: number;
  groups: MediaBrowseIndexGroup[];
}

export interface MediaRef {
  mediaId?: number;
  system?: string;
  path?: string;
}

export type MediaMetaParams = MediaRef;

export interface MediaMetaProperty {
  text: string;
  contentType: string;
  extension?: string;
  blobSize?: number;
}

export interface MediaMetaSystemRef {
  id: string;
  name: string;
}

export interface MediaMetaTitle {
  slug: string;
  secondarySlug?: string;
  name: string;
  slugLength: number;
  slugWordCount: number;
  system: MediaMetaSystemRef;
  tags: TagInfo[];
  properties: Record<string, MediaMetaProperty>;
  availableImageTypes?: string[];
}

export interface MediaMeta {
  path: string;
  parentDir: string;
  isMissing: boolean;
  tags: TagInfo[];
  properties: Record<string, MediaMetaProperty>;
  launcherOverride?: string;
  availableImageTypes?: string[];
  title: MediaMetaTitle;
}

export interface MediaMetaResponse {
  media: MediaMeta;
}

export type MediaImageParams = MediaRef & {
  imageTypes?: string[];
  maxSize?: number;
};

export interface MediaImageResponse {
  contentType: string;
  extension?: string;
  data: string;
  typeTag: string;
}

export interface SearchResultGame {
  mediaId?: number;
  system: System;
  name: string;
  path: string;
  relativePath?: string;
  zapScript?: string;
  tags: TagInfo[];
  disambiguatingTags?: TagInfo[];
}

export interface Pagination {
  nextCursor: string | null;
  hasNextPage: boolean;
  pageSize: number;
}

export interface SearchResultsResponse {
  results: SearchResultGame[];
  total: number;
  pagination?: Pagination;
}

export interface System {
  id: string;
  name: string;
  category?: string;
  releaseDate?: string;
  manufacturer?: string;
  zapScript?: string;
  mediaCount?: number;
}

export interface SystemsParams {
  all?: boolean;
}

export interface SystemsResponse {
  systems: System[];
}

export interface MediaTagsResponse {
  tags: TagInfo[];
}

export type MediaTagsUpdateParams = MediaRef & {
  add?: string[];
  remove?: string[];
};

export type MediaTagsUpdateResponse = MediaTagsResponse;

export type MappingType = "uid" | "text" | "data";
export type MappingSource = "database" | "file";

export interface MappingResponse {
  id: string;
  added: string;
  label: string;
  enabled: boolean;
  type: MappingType;
  match: string;
  pattern: string;
  override: string;
  source: MappingSource;
  readOnly: boolean;
}

export interface AllMappingsParams {
  includeReadOnly?: boolean;
}

export interface AllMappingsResponse {
  mappings: MappingResponse[];
}

export interface AddMappingRequest {
  label: string;
  enabled: boolean;
  type: MappingType;
  match: string;
  pattern: string;
  override: string;
}

export interface UpdateMappingRequest {
  id: number;
  label?: string;
  enabled?: boolean;
  type?: MappingType;
  match?: string;
  pattern?: string;
  override?: string;
}

export interface HistoryResponseEntry {
  time: string;
  type: string;
  uid: string;
  text: string;
  data: string;
  success: boolean;
}

export interface HistoryResponse {
  entries: HistoryResponseEntry[];
}

export interface SettingsResponse {
  runZapScript: boolean;
  debugLogging: boolean;
  errorReporting: boolean;
  audioScanFeedback: boolean;
  readersAutoDetect: boolean;
  readersScanMode: "tap" | "hold" | "insert";
  readersScanExitDelay: number;
  readersScanIgnoreSystems: string[];
  backupRemoteEnabled?: boolean;
  playtimeSyncEnabled?: boolean;
  backupRemoteSchedule?: "daily" | "weekly" | "manual";
  backupRemoteBaseUrl?: string;
  launchGuardEnabled?: boolean;
  launchGuardTimeout?: number;
  launchGuardDelay?: number;
  launchGuardRequireConfirm?: boolean;
}

export interface UpdateSettingsRequest {
  debugLogging?: boolean;
  errorReporting?: boolean;
  audioScanFeedback?: boolean;
  readersAutoDetect?: boolean;
  readersScanMode?: "tap" | "hold" | "insert";
  readersScanExitDelay?: number;
  readersScanIgnoreSystems?: string[];
  runZapScript?: boolean;
  backupRemoteEnabled?: boolean;
  playtimeSyncEnabled?: boolean;
  backupRemoteSchedule?: "daily" | "weekly" | "manual";
  launchGuardEnabled?: boolean;
  launchGuardTimeout?: number;
  launchGuardDelay?: number;
  launchGuardRequireConfirm?: boolean;
}

export interface TokenResponse {
  type: string;
  uid: string;
  text: string;
  data: string;
  scanTime: string;
  readerId?: string;
}

export interface IndexResponse {
  exists: boolean;
  indexing: boolean;
  optimizing?: boolean;
  paused?: boolean;
  totalSteps?: number;
  currentStep?: number;
  currentStepDisplay?: string;
  totalFiles?: number;
  totalMedia?: number;
  systemsCompleted?: number;
  systemsTotal?: number;
}

export type MediaSlot = "primary" | "background";

export interface PlayingResponse {
  systemId: string;
  systemName: string;
  mediaName: string;
  mediaPath: string;
  zapScript?: string;
  started?: string;
  launcherId?: string;
  launcherControls?: string[];
  slot?: MediaSlot;
}

export enum ScanResult {
  Default,
  Success,
  Error,
}

export interface PlaylistItemInfo {
  name: string;
  zapScript: string;
}

export interface PlaylistState {
  id: string;
  name: string;
  slot: MediaSlot;
  repeat: "none" | "all" | "one";
  items: PlaylistItemInfo[];
  index: number;
  total: number;
  playing: boolean;
}

export interface MediaResponse {
  database: IndexResponse;
  active: PlayingResponse[];
  playlists?: PlaylistState[];
}

export interface TokensResponse {
  active: TokenResponse[];
  last?: TokenResponse;
}

export interface LogDownloadResponse {
  filename: string;
  content: string;
  size: number;
}

export interface ReaderInfo {
  id: string;
  info: string;
  capabilities: string[];
  connected: boolean;
}

export interface ReadersResponse {
  readers: ReaderInfo[];
}

export interface MediaActiveUpdateRequest {
  systemId: string;
  mediaPath: string;
  mediaName: string;
}

export interface MediaControlRequest {
  action: "stop";
  slot?: MediaSlot;
  args?: Record<string, string>;
}

export interface PlaytimeLimitsConfig {
  enabled: boolean;
  daily: string;
  session: string;
  sessionReset: string;
  warnings: string[];
  retention: number;
}

export interface PlaytimeStatus {
  state: "reset" | "active" | "cooldown";
  sessionActive: boolean;
  sessionStarted?: string;
  sessionDuration?: string;
  sessionCumulativeTime?: string;
  sessionRemaining?: string;
  cooldownRemaining?: string;
  dailyUsageToday?: string;
  dailyRemaining?: string;
  limitsEnabled: boolean;
}

export interface PlaytimeLimitsUpdateRequest {
  enabled?: boolean;
  daily?: string;
  session?: string;
  sessionReset?: string;
  warnings?: string[];
  retention?: number;
}

export interface PlaytimeLimitWarningParams {
  interval: string;
  remaining: string;
}

export interface PlaytimeLimitReachedParams {
  reason: "daily" | "session";
}

// Online API Requirements
export type RequirementType =
  | "terms_acceptance"
  | "age_verified"
  | "email_verified";

export interface PendingRequirement {
  type: RequirementType;
  description: string;
  endpoint: string;
}

export interface RequirementsStatus {
  email_verified: boolean;
  tos_accepted: boolean;
  privacy_accepted: boolean;
  age_verified: boolean;
}

export interface RequiredVersions {
  tos: string;
  privacy: string;
}

export interface AcceptedVersions {
  tos: string | null;
  privacy: string | null;
}

export interface RequirementsResponse {
  requirements: RequirementsStatus;
  required_versions: RequiredVersions;
  accepted_versions: AcceptedVersions;
}

export interface PatreonSubscriptionInfo {
  linked: boolean;
  status: string;
  linked_at: string;
}

export interface RevenueCatSubscriptionInfo {
  active: boolean;
  product_id?: string;
  billing_period?: "monthly" | "annual";
  store?: string;
  expires_at?: string;
  will_renew: boolean;
}

export interface SubscriptionResponse {
  is_premium: boolean;
  sources: string[];
  patreon?: PatreonSubscriptionInfo | null;
  revenuecat?: RevenueCatSubscriptionInfo | null;
}

export interface UpdateRequirementsRequest {
  accept_tos?: boolean;
  accept_privacy?: boolean;
  age_verified?: boolean;
}

export interface DeleteAccountResponse {
  message: string;
  scheduled_deletion_at: string;
  can_cancel_until: string;
}

export enum InboxSeverity {
  Info = 0,
  Warning = 1,
  Error = 2,
}

export interface InboxMessage {
  id: number;
  title: string;
  body?: string;
  severity: InboxSeverity;
  category?: string;
  profileId?: number;
  createdAt: string;
}

export interface InboxResponse {
  messages: InboxMessage[];
}

export interface DeleteInboxRequest {
  id: number;
}

// ---------------------------------------------------------------------------
// scrapers
// ---------------------------------------------------------------------------

/** One entry returned by the "scrapers" RPC method. */
export interface ScraperInfo {
  /** Stable machine-readable identifier (e.g. "gamelist.xml"). */
  id: string;
  /** Human-readable display name (e.g. "ES gamelist.xml"). */
  name: string;
  /** Supported system IDs. Empty means the scraper can run against all systems. */
  supportedSystems: string[];
}

/** Response shape for the "scrapers" JSON-RPC method. */
export interface ScrapersResponse {
  scrapers: ScraperInfo[];
}

// ---------------------------------------------------------------------------
// media.scrape
// ---------------------------------------------------------------------------

/**
 * Parameters for the "media.scrape" RPC method.
 *
 * The call returns immediately with a null result; progress is delivered via
 * "media.scraping" notifications until Done is true.
 */
export interface MediaScrapeParams {
  /** ID of the scraper to run, e.g. "gamelist.xml". Must match a value from the "scrapers" method. */
  scraperId: string;
  /**
   * Limit scraping to these system IDs.
   * Omit or pass an empty array to scrape all systems.
   */
  systems?: string[];
  /** When true, re-processes records that already carry a sentinel tag from a prior run. */
  force?: boolean;
}

// ---------------------------------------------------------------------------
// media.scrape.status / media.scrape.cancel / media.scrape.resume
// ---------------------------------------------------------------------------

/** Response for media.scrape.cancel. */
export interface MediaScrapeCancelResponse {
  message: string;
}

/** Response for media.scrape.resume. */
export interface MediaScrapeResumeResponse {
  message: string;
}

export interface MediaCleanOrphansResponse {
  deleted: number;
}

// ---------------------------------------------------------------------------
// media.scraping  (notification)
// ---------------------------------------------------------------------------

/**
 * Payload broadcast on the "media.scraping" notification channel.
 *
 * Emitted for every ScrapeUpdate received from the running scraper and once
 * more when the run finishes or is cancelled (scraping: false, done: true).
 *
 * Mirrors Go struct: ScrapingStatusResponse (pkg/api/models/responses.go).
 */
export interface ScrapeSystemProgress {
  systemId: string;
  systemName?: string;
  processed: number;
  total: number;
  matched: number;
  skipped: number;
}

export interface ScrapingStatusNotification {
  /** ID of the scraper that is running, e.g. "gamelist.xml". */
  scraperId?: string;
  /** 1-based current system step in the overall scrape run. */
  currentStep?: number;
  /** Display name for the current overall step. */
  currentStepDisplay?: string;
  /** Total system steps in the overall scrape run. */
  totalSteps?: number;
  /** Current system progress, when Core provides the structured payload. */
  currentSystem?: ScrapeSystemProgress;
  /** System currently being scraped. Omitted between system transitions. */
  systemId?: string;
  /** Number of source records processed so far. */
  processed: number;
  /** Total source records for the current system, or 0 before known. */
  total: number;
  /** Number of records successfully matched and enriched. */
  matched: number;
  /** Number of records skipped, unmatched, or failed per-record processing. */
  skipped: number;
  /** Number of media records already marked scraped. */
  totalScraped: number;
  /** True while scraping is in progress, false on the terminal event. */
  scraping: boolean;
  /** True on the final notification for this run. */
  done: boolean;
  /** True when the active scrape is paused. */
  paused: boolean;
}
