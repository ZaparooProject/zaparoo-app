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
  private removal: Promise<void> | null = null;

  addHandler(handler: BackButtonHandler) {
    this.handlers.push(handler);
    this.handlers.sort((a, b) => b.priority - a.priority);
    this.setupListener();
  }

  removeHandler(handler: BackButtonHandler) {
    this.handlers = this.handlers.filter(
      (registered) => registered !== handler,
    );
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
    if (this.listener || this.removal) return;

    this.listener = App.addListener("backButton", () => {
      for (const { handler } of this.handlers) {
        const result = handler();
        if (result === true) {
          return; // Handler consumed the event
        }
      }
    });
  }

  private removeListener(): Promise<void> {
    if (this.removal) return this.removal;
    const listener = this.listener;
    if (!listener) return Promise.resolve();

    this.removal = (async () => {
      try {
        const handle = await listener;
        await handle.remove();
      } finally {
        if (this.listener === listener) this.listener = null;
      }
    })().finally(() => {
      this.removal = null;
      if (this.handlers.length > 0) this.setupListener();
    });

    return this.removal;
  }

  async destroy() {
    this.handlers = [];
    await this.removeListener();
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
      backButtonManager.removeHandler(handlerObj);
    };
  }, [id, handler, priority, enabled]);
}
