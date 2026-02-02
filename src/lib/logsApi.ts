import { logger } from "@/lib/logger";

const UPLOAD_ENDPOINT = "https://logs.zaparoo.org/";
const UPLOAD_TIMEOUT_MS = 30000;

export async function uploadLogs(content: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
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
