import "@testing-library/jest-dom/vitest";

// Provide a minimal Worker polyfill for jsdom so Evolu can initialize.
if (typeof globalThis.Worker === "undefined") {
  class MockWorker {
    onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;

    constructor() {}

    postMessage(): void {}

    terminate(): void {}

    addEventListener(): void {}

    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
  }

  // @ts-expect-error assign polyfill
  globalThis.Worker = MockWorker;
}
