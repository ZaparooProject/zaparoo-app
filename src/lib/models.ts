export enum Method {
  Launch = "launch",
  Stop = "stop",
  History = "tokens.history",
  MediaSearch = "media.search",
  MediaIndex = "media.index",
  Systems = "systems",
  Settings = "settings",
  SettingsUpdate = "settings.update",
  Mappings = "mappings",
  MappingsNew = "mappings.new",
  MappingsDelete = "mappings.delete",
  MappingsUpdate = "mappings.update",
  Readers = "readers",
  ReadersWrite = "readers.write",
  Version = "version",
  Status = "status" // DEPRECATED
}

export enum Notification {
  ReadersConnected = "readers.connected",
  ReadersDisconnected = "readers.disconnected",
  TokensLaunching = "tokens.launching",
  TokensActive = "tokens.active",
  MediaStarted = "media.started",
  MediaStopped = "media.stopped",
  MediaIndexing = "media.indexing"
}

export interface VersionResponse {
  version: string;
  platform: string;
}

export interface LaunchRequest {
  uid: string;
  text: string;
}

export interface WriteRequest {
  text: string;
}

export interface SearchParams {
  query: string;
  systems: string[];
}

export interface SearchResultGame {
  system: System;
  name: string;
  path: string;
}

export interface SearchResultsResponse {
  results: SearchResultGame[];
  total: number;
}

export interface System {
  id: string;
  name: string;
  category: string;
}

export interface SystemsResponse {
  systems: System[];
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
  label?: string;
  enabled?: boolean;
  type?: MappingType;
  match?: string;
  pattern?: string;
  override?: string;
}

export interface HistoryResponseEntry {
  time: string;
  uid: string;
  text: string;
  success: boolean;
}

export interface HistoryResponse {
  entries: HistoryResponseEntry[];
}

export interface SettingsResponse {
  launchingActive: boolean;
  debugLogging: boolean;
  audioScanFeedback: boolean;
  readersAutoDetect: boolean;
  readersScanMode: "tap" | "hold";
  readersScanExitDelay: number;
  readersScanIgnoreSystems: string[];
}

export interface UpdateSettingsRequest {
  launchingActive?: boolean;
  debugLogging?: boolean;
  audioScanFeedback?: boolean;
  readersAutoDetect?: boolean;
  readersScanMode?: "tap" | "hold";
  readersScanExitDelay?: number;
  readersScanIgnoreSystems?: string[];
}

export interface TokenResponse {
  type: string;
  uid: string;
  text: string;
  scanTime: string;
}

export interface IndexResponse {
  exists: boolean;
  indexing: boolean;
  totalSteps: number;
  currentStep: number;
  currentDesc: string;
  totalFiles: number;
}

export interface PlayingResponse {
  systemId: string;
  systemName: string;
  mediaName: string;
  mediaPath: string;
}

export enum ScanResult {
  Default,
  Success,
  Error
}

export interface StatusResponse {
  gamesIndex: IndexResponse;
}
