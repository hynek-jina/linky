import { emitInspectorEvent, isInspectorEnabled } from "./inspectorBus";

const MUTATION_METHOD_NAMES = ["insert", "update", "upsert"];

// Evolu mutations are always called as (table, props, options?).
type MutationArgs = [table: unknown, props: unknown, options?: unknown];
type WrappedMethod = (...args: MutationArgs) => unknown;

// Factory instead of a direct `<T>(evolu: T) => T` function so the per-target
// proxy cache can be typed WeakMap<T, T> without casts. The proxy keeps a
// stable identity per Evolu instance (safe for React dependency arrays) and
// only intercepts the three mutation methods.
export const createEvoluMutationsInstrument = <T extends object>(): ((
  evolu: T,
) => T) => {
  const proxyCache = new WeakMap<T, T>();
  const wrappedMethodCache = new WeakMap<object, WrappedMethod>();

  return (evolu: T): T => {
    if (!isInspectorEnabled()) return evolu;

    const cachedProxy = proxyCache.get(evolu);
    if (cachedProxy) return cachedProxy;

    const proxy = new Proxy(evolu, {
      get(target, property, receiver) {
        const value: unknown = Reflect.get(target, property, receiver);
        if (
          typeof property !== "string" ||
          !MUTATION_METHOD_NAMES.includes(property) ||
          typeof value !== "function"
        ) {
          return value;
        }

        const cachedMethod = wrappedMethodCache.get(value);
        if (cachedMethod) return cachedMethod;

        const wrapped: WrappedMethod = (...args) => {
          const result: unknown = Reflect.apply(value, target, args);
          const [table, props, options] = args;
          emitInspectorEvent({
            channel: "evolu",
            type: `mutation.${property}`,
            direction: "out",
            summary: `${property} ${typeof table === "string" ? table : "?"}`,
            data: { table, props, options, result },
          });
          return result;
        };
        wrappedMethodCache.set(value, wrapped);
        return wrapped;
      },
    });

    proxyCache.set(evolu, proxy);
    return proxy;
  };
};
