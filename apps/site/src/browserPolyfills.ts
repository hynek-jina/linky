import { Buffer } from "buffer";

type BufferFromArgs =
  | [arrayLike: ArrayLike<number> | ArrayBufferView]
  | [
      arrayBuffer: ArrayBuffer | SharedArrayBuffer,
      byteOffset?: number,
      length?: number,
    ]
  | [value: string, encoding?: string];

interface ProcessLike {
  emitWarning?: (message: string, type?: string, code?: string) => void;
  env?: Record<string, string | undefined>;
}

const isBufferConstructor = (value: unknown): value is typeof Buffer => {
  return typeof value === "function" && "from" in value && "prototype" in value;
};

const getGlobalBuffer = (): typeof Buffer | null => {
  const candidate = Reflect.get(globalThis, "Buffer");
  return isBufferConstructor(candidate) ? candidate : null;
};

const getGlobalProcess = (): ProcessLike | null => {
  const candidate = Reflect.get(globalThis, "process");
  if (candidate && typeof candidate === "object") {
    return candidate as ProcessLike;
  }
  return null;
};

if (!getGlobalBuffer()) {
  try {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      value: Buffer,
      writable: true,
    });
  } catch {
    Reflect.set(globalThis, "Buffer", Buffer);
  }
}

if (!getGlobalProcess()) {
  const processShim: ProcessLike = {
    emitWarning: (message: string, type?: string, code?: string) => {
      if (
        typeof console !== "undefined" &&
        typeof console.warn === "function"
      ) {
        console.warn(message, type, code);
      }
    },
    env: {},
  };

  try {
    Object.defineProperty(globalThis, "process", {
      configurable: true,
      value: processShim,
      writable: true,
    });
  } catch {
    Reflect.set(globalThis, "process", processShim);
  }
}

(() => {
  const B = getGlobalBuffer();
  if (!B) return;

  const patchMarker = "__linkySiteBase64UrlPatched";
  if (Reflect.get(B.prototype, patchMarker) === true) return;

  const toBase64Url = (base64: string) =>
    base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");

  const fromBase64Url = (base64url: string) => {
    const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4;
    return pad === 0 ? base64 : base64 + "=".repeat(4 - pad);
  };

  const origToString = B.prototype.toString;
  Object.defineProperty(B.prototype, "toString", {
    configurable: true,
    value: function (
      this: Buffer,
      encoding?: string,
      start?: number,
      end?: number,
    ) {
      if (encoding === "base64url") {
        return toBase64Url(origToString.call(this, "base64", start, end));
      }
      return origToString.call(this, encoding, start, end);
    },
    writable: true,
  });

  const origFrom = B.from;
  Object.defineProperty(B, "from", {
    configurable: true,
    value: function (this: typeof Buffer, ...args: BufferFromArgs) {
      const [value, encodingOrOffset] = args;
      if (typeof value === "string" && encodingOrOffset === "base64url") {
        return Reflect.apply(origFrom, this, [fromBase64Url(value), "base64"]);
      }
      return Reflect.apply(origFrom, this, args);
    },
    writable: true,
  });

  Reflect.set(B.prototype, patchMarker, true);
})();
