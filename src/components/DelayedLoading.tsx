import { type ReactNode, useEffect, useState } from "react";

export const DEFAULT_LOADING_DELAY_MS = 300;

export function DelayedLoading(props: {
  children: ReactNode;
  delayMs?: number;
}) {
  const delayMs = props.delayMs ?? DEFAULT_LOADING_DELAY_MS;
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) return;
    const timeout = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs]);

  return visible ? props.children : null;
}
