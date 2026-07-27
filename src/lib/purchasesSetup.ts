// Promise executor runs synchronously, so _resolve is always assigned before use
let _resolve!: () => void;

export const purchasesReady: Promise<void> = new Promise<void>((resolve) => {
  _resolve = resolve;
});

export function resolvePurchasesReady(): void {
  _resolve();
}
