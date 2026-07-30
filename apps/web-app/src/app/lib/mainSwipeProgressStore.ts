import React from "react";

/**
 * Frame-rate swipe progress lives outside React shell state on purpose:
 * updating it via useState in useAppShellComposition re-ran the whole app
 * shell (10k-line hook graph + both swipe pages) on every scroll event while
 * dragging between Contacts and Wallet. Only the bottom tab indicator and the
 * FAB need per-frame progress, so they subscribe to this store directly.
 */
export interface MainSwipeProgressState {
  isDragging: boolean;
  progress: number;
}

let state: MainSwipeProgressState = { isDragging: false, progress: 0 };
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const mainSwipeProgressStore = {
  get: (): MainSwipeProgressState => state,
  setDragging: (isDragging: boolean): void => {
    if (state.isDragging === isDragging) return;
    state = { ...state, isDragging };
    emit();
  },
  setProgress: (progress: number): void => {
    const clamped = Math.min(1, Math.max(0, progress));
    if (state.progress === clamped) return;
    state = { ...state, progress: clamped };
    emit();
  },
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const useMainSwipeProgress = (): MainSwipeProgressState =>
  React.useSyncExternalStore(
    mainSwipeProgressStore.subscribe,
    mainSwipeProgressStore.get,
    mainSwipeProgressStore.get,
  );
