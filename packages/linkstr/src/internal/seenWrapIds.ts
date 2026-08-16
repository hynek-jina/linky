export const DEFAULT_SEEN_WRAP_IDS_CAPACITY = 4096;

/**
 * FIFO eviction relies on Set insertion order. Only authenticated wraps may
 * be recorded: a tampered copy must not mark its id as seen and suppress an
 * honest copy. Callers decide which authenticated arrivals to record:
 * WrapInbox records all, while PushInbox records only live emissions so
 * backfill can be re-emitted.
 */
export const makeSeenWrapIds = (capacity: number) => {
  const seen = new Set<string>();
  return {
    has: (wrapId: string): boolean => seen.has(wrapId),
    add: (wrapId: string): void => {
      seen.add(wrapId);
      if (seen.size > capacity) {
        const oldest = seen.values().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
    },
  };
};
