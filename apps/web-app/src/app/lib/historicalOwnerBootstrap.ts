export interface HistoricalOwnerBootstrapState {
  loginKey: string;
  ownerIds: string[];
}

export const advanceHistoricalOwnerBootstrapState = (
  previous: HistoricalOwnerBootstrapState,
  loginKey: string,
  newlySyncedOwnerIds: readonly string[],
): HistoricalOwnerBootstrapState => {
  if (!loginKey) {
    if (!previous.loginKey && previous.ownerIds.length === 0) return previous;
    return { loginKey: "", ownerIds: [] };
  }

  const previousOwnerIds =
    previous.loginKey === loginKey ? previous.ownerIds : [];
  const ownerIds = Array.from(
    new Set([...previousOwnerIds, ...newlySyncedOwnerIds.filter(Boolean)]),
  );
  if (
    previous.loginKey === loginKey &&
    ownerIds.length === previous.ownerIds.length
  ) {
    return previous;
  }

  return { loginKey, ownerIds };
};

export const getPendingHistoricalOwnerIds = (
  historicalOwnerIds: readonly string[],
  state: HistoricalOwnerBootstrapState,
  loginKey: string,
): string[] => {
  const syncedOwnerIds = new Set(
    state.loginKey === loginKey ? state.ownerIds : [],
  );
  return historicalOwnerIds.filter(
    (ownerId) => ownerId && !syncedOwnerIds.has(ownerId),
  );
};
