import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LOG_FILE_BYTES, uploadLogs } from "@/lib/logsApi";

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

function encodeBase64(content: Uint8Array) {
  let binary = "";
  for (const byte of content) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("uploadLogs", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should preserve original log bytes in the upload", async () => {
    const content = new TextEncoder().encode('{"message":"café"}\n');
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("https://logs.zaparoo.org/test.log", { status: 200 }),
      );

    await uploadLogs(encodeBase64(content));

    const formData = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const file = formData.get("file") as File;
    expect(file.size).toBe(content.byteLength);
  });

  it("should trim oldest log bytes to leave room for multipart overhead", async () => {
    const content = new TextEncoder().encode(
      `old line\n${"x".repeat(MAX_LOG_FILE_BYTES + 100)}`,
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response("https://logs.zaparoo.org/test.log", { status: 200 }),
      );

    await uploadLogs(encodeBase64(content));

    const formData = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const file = formData.get("file") as File;
    const request = new Request("https://logs.zaparoo.org/", {
      method: "POST",
      body: formData,
    });
    const requestBody = await request.arrayBuffer();

    expect(file.size).toBeLessThanOrEqual(MAX_LOG_FILE_BYTES);
    expect(requestBody.byteLength).toBeLessThanOrEqual(1024 * 1024);
  });
});
