import { type ReactNode, useEffect, useState } from "react";

export const DEFAULT_LOADING_DELAY_MS = 300;

export function DelayedLoading(props: {
  children: ReactNode;
  delayMs?: number;
}) {
  const delayMs = props.delayMs ?? DEFAULT_LOADING_DELAY_MS;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (delayMs <= 0) return;

    const timeout = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs]);

  return delayMs <= 0 || visible ? props.children : null;
}
