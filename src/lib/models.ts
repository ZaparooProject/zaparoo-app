export enum Method {
  Run = "run",
  Stop = "stop",
  Tokens = "tokens",
  History = "tokens.history",
  Media = "media",
  MediaSearch = "media.search",
  MediaGenerate = "media.generate",
  MediaGenerateCancel = "media.generate.cancel",
  MediaActive = "media.active",
  MediaActiveUpdate = "media.active.update",
  MediaTags = "media.tags",
  Systems = "systems",
  Settings = "settings",
  SettingsUpdate = "settings.update",
  SettingsReload = "settings.reload",
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
  PlaytimeLimitsUpdate = "settings.playtime.limits.update"
}

export enum Notification {
  ReadersConnected = "readers.added",
  ReadersDisconnected = "readers.removed",
  TokensLaunching = "running",
  TokensScanned = "tokens.added",
  TokensRemoved = "tokens.removed",
  MediaStarted = "media.started",
  MediaStopped = "media.stopped",
  MediaIndexing = "media.indexing",
  PlaytimeLimitWarning = "playtime.limit.warning",
  PlaytimeLimitReached = "playtime.limit.reached"
}

export interface VersionResponse {
  version: string;
  platform: string;
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
}

export interface SearchResultGame {
  system: System;
  name: string;
  path: string;
  zapScript?: string;
  tags: TagInfo[];
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
}

export interface SystemsResponse {
  systems: System[];
}

export interface MediaTagsResponse {
  tags: TagInfo[];
}

export type MappingType = "uid" | "text" | "data";

export interface MappingResponse {
  id: string;
  added: string;
  label: string;
  enabled: boolean;
  type: MappingType;
  match: string;
  pattern: string;
  override: string;
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
  audioScanFeedback: boolean;
  readersAutoDetect: boolean;
  readersScanMode: "tap" | "hold" | "insert";
  readersScanExitDelay: number;
  readersScanIgnoreSystems: string[];
}

export interface UpdateSettingsRequest {
  debugLogging?: boolean;
  audioScanFeedback?: boolean;
  readersAutoDetect?: boolean;
  readersScanMode?: "tap" | "hold" | "insert";
  readersScanExitDelay?: number;
  readersScanIgnoreSystems?: string[];
  runZapScript?: boolean;
}

export interface TokenResponse {
  type: string;
  uid: string;
  text: string;
  data: string;
  scanTime: string;
}

export interface IndexResponse {
  exists: boolean;
  indexing: boolean;
  optimizing?: boolean;
  totalSteps?: number;
  currentStep?: number;
  currentStepDisplay?: string;
  totalFiles?: number;
  totalMedia?: number;
}

export interface PlayingResponse {
  systemId: string;
  systemName: string;
  mediaName: string;
  mediaPath: string;
  started?: string;
  launcherId?: string;
}

export enum ScanResult {
  Default,
  Success,
  Error
}

export interface MediaResponse {
  database: IndexResponse;
  active: PlayingResponse[];
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
  sessionStarted: string;
  sessionDuration: string;
  sessionCumulativeTime: string;
  sessionRemaining: string;
  cooldownRemaining?: string;
  dailyUsageToday: string;
  dailyRemaining: string;
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
  remaining: string;
  type: "daily" | "session";
}

export interface PlaytimeLimitReachedParams {
  reason: "daily" | "session";
}
