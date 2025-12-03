import { useEffect } from "react";
import { App } from "@capacitor/app";
import { logger } from "@/lib/logger";

interface BackButtonHandler {
  id: string;
  handler: () => boolean | void; // Return true to prevent further handling
  priority: number; // Higher numbers = higher priority
}

class BackButtonManager {
  private handlers: BackButtonHandler[] = [];
  private listener: Promise<{ remove: () => void }> | null = null;

  addHandler(handler: BackButtonHandler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => b.priority - a.priority);
    this.setupListener();
  }

  removeHandler(id: string) {
    this.handlers = this.handlers.filter((h) => h.id !== id);
    if (this.handlers.length === 0) {
      this.removeListener().catch((e) => {
        logger.error("Failed to remove back button listener:", e, {
          category: "lifecycle",
          action: "removeBackButtonListener",
          severity: "warning",
        });
      });
    }
  }

  private setupListener() {
    if (this.listener) return;

    this.listener = App.addListener("backButton", () => {
      for (const { handler } of this.handlers) {
        const result = handler();
        if (result === true) {
          return; // Handler consumed the event
        }
      }
    });
  }

  private async removeListener() {
    if (this.listener) {
      const handle = await this.listener;
      handle.remove();
      this.listener = null;
    }
  }

  async destroy() {
    await this.removeListener();
    this.handlers = [];
  }
}

const backButtonManager = new BackButtonManager();

export function useBackButtonHandler(
  id: string,
  handler: () => boolean | void,
  priority: number = 50,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) return;

    const handlerObj: BackButtonHandler = {
      id,
      handler,
      priority,
    };

    backButtonManager.addHandler(handlerObj);

    return () => {
      backButtonManager.removeHandler(id);
    };
  }, [id, handler, priority, enabled]);
}
