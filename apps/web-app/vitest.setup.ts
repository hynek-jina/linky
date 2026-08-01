import "@testing-library/jest-dom/vitest";
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  Object.defineProperty(globalThis, "Buffer", {
    configurable: true,
    value: Buffer,
    writable: true,
  });
}

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

// Node >= 25 defines `localStorage`/`sessionStorage` on globalThis (localStorage
// resolves to undefined without --localstorage-file). Vitest's jsdom environment
// skips any window key that already exists on globalThis, so jsdom's real Storage
// objects are never installed. Note `window === globalThis` here, so there is
// nothing to alias from — the jsdom instance itself is the only source.
const isStorageLike = (value: unknown): value is Storage => {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "getItem") === "function" &&
    typeof Reflect.get(value, "setItem") === "function" &&
    typeof Reflect.get(value, "removeItem") === "function" &&
    typeof Reflect.get(value, "clear") === "function"
  );
};

const readJsdomStorage = (
  name: "localStorage" | "sessionStorage",
): Storage | null => {
  const dom: unknown = Reflect.get(globalThis, "jsdom");
  if (typeof dom !== "object" || dom === null) return null;
  const win: unknown = Reflect.get(dom, "window");
  if (typeof win !== "object" || win === null) return null;
  const storage: unknown = Reflect.get(win, name);
  return isStorageLike(storage) ? storage : null;
};

for (const name of ["localStorage", "sessionStorage"] as const) {
  const jsdomStorage = readJsdomStorage(name);
  if (jsdomStorage === null) {
    throw new Error(
      `vitest.setup: no jsdom ${name} available to install on globalThis`,
    );
  }
  if (globalThis[name] !== jsdomStorage) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: jsdomStorage,
      writable: true,
    });
  }
}
