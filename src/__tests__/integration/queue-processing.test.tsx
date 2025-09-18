import { describe, it, expect, beforeEach } from 'vitest';
import { useStatusStore } from '../../lib/store';

describe('Queue Processing Integration', () => {
  beforeEach(() => {
    // Reset store to initial state
    useStatusStore.getState().setRunQueue(null);
    useStatusStore.getState().setWriteQueue("");
  });

  it('should initialize queues in empty state', () => {
    const state = useStatusStore.getState();

    expect(state.runQueue).toBeNull();
    expect(state.writeQueue).toBe("");
  });
});