import { logger } from "@/lib/logger";

const UPLOAD_ENDPOINT = "https://logs.zaparoo.org/";
const UPLOAD_TIMEOUT_MS = 30000;
const MAX_UPLOAD_BODY_BYTES = 1024 * 1024;
const MULTIPART_OVERHEAD_RESERVE_BYTES = 1024;
export const MAX_LOG_FILE_BYTES =
  MAX_UPLOAD_BODY_BYTES - MULTIPART_OVERHEAD_RESERVE_BYTES;

function decodeBase64(content: string): Uint8Array<ArrayBuffer> {
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function fitLogToUploadLimit(content: Uint8Array<ArrayBuffer>) {
  if (content.byteLength <= MAX_LOG_FILE_BYTES) return content;

  const tail = content.slice(content.byteLength - MAX_LOG_FILE_BYTES);
  const firstNewline = tail.indexOf(10);
  return firstNewline >= 0 ? tail.slice(firstNewline + 1) : tail;
}

export async function uploadLogs(base64Content: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    const content = fitLogToUploadLimit(decodeBase64(base64Content));
    const blob = new Blob([content], { type: "text/plain" });
    const formData = new FormData();
    formData.append("file", blob, "core.log");

    const response = await fetch(UPLOAD_ENDPOINT, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const url = await response.text();
    return url.trim();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.error("Log upload timed out", error, {
        category: "api",
        action: "uploadLogs",
        severity: "warning",
      });
      throw new Error("Upload timed out");
    }

    logger.error("Failed to upload logs", error, {
      category: "api",
      action: "uploadLogs",
      severity: "warning",
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
