import { vi } from "vitest";

export const Directory = {
  Cache: "CACHE",
  Data: "DATA",
  Documents: "DOCUMENTS",
  External: "EXTERNAL",
  ExternalStorage: "EXTERNAL_STORAGE",
  Library: "LIBRARY",
};

export const Encoding = {
  UTF8: "utf8",
  ASCII: "ascii",
  UTF16: "utf16",
};

export const Filesystem = {
  writeFile: vi.fn().mockResolvedValue({ uri: "file:///mock/path/file.txt" }),
  readFile: vi.fn().mockResolvedValue({ data: "" }),
  deleteFile: vi.fn().mockResolvedValue(undefined),
  getUri: vi.fn().mockResolvedValue({ uri: "file:///mock/path/file.txt" }),
  stat: vi.fn().mockResolvedValue({
    type: "file",
    size: 0,
    ctime: 0,
    mtime: 0,
    uri: "file:///mock/path/file.txt",
  }),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue({ files: [] }),
  copy: vi.fn().mockResolvedValue({ uri: "file:///mock/path/file.txt" }),
  rename: vi.fn().mockResolvedValue(undefined),
};
