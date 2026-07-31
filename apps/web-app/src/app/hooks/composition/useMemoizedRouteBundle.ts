/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";

type DependencyValue =
  | bigint
  | boolean
  | ((...args: never[]) => unknown)
  | null
  | number
  | object
  | string
  | symbol
  | undefined;

const isDependencyValue = (value: unknown): value is DependencyValue =>
  value === null ||
  value === undefined ||
  typeof value === "bigint" ||
  typeof value === "boolean" ||
  typeof value === "function" ||
  typeof value === "number" ||
  typeof value === "object" ||
  typeof value === "string" ||
  typeof value === "symbol";

const readOwnValues = (value: object): DependencyValue[] =>
  Reflect.ownKeys(value).flatMap((key) => {
    const field = Reflect.get(value, key);
    return isDependencyValue(field) ? [field] : [];
  });

type KeySignatureEntry = readonly [depth: number, key: PropertyKey];

const keySignaturesMatch = (
  left: readonly KeySignatureEntry[],
  right: readonly KeySignatureEntry[],
): boolean =>
  left.length === right.length &&
  left.every(
    ([depth, key], index) =>
      depth === right[index]?.[0] && Object.is(key, right[index]?.[1]),
  );

const useKeySignatureDependency = (
  signature: readonly KeySignatureEntry[],
): object => {
  const dependencyRef = React.useRef<object>({});
  const previousSignatureRef = React.useRef<readonly KeySignatureEntry[]>([]);

  if (!keySignaturesMatch(previousSignatureRef.current, signature)) {
    previousSignatureRef.current = signature;
    dependencyRef.current = {};
  }

  return dependencyRef.current;
};

export const useMemoizedRouteBuilder = <
  TInput extends object,
  TOutput extends object,
>(
  input: TInput,
  build: (value: TInput) => TOutput,
): TOutput => {
  const signature = Reflect.ownKeys(input).map(
    (key): KeySignatureEntry => [0, key],
  );
  const keySignatureDependency = useKeySignatureDependency(signature);
  const dependencies = readOwnValues(input);
  return React.useMemo(
    () => build(input),
    [keySignatureDependency, ...dependencies],
  );
};

export const useMemoizedContextValue = <T extends object>(value: T): T => {
  const signature = Reflect.ownKeys(value).map(
    (key): KeySignatureEntry => [0, key],
  );
  const keySignatureDependency = useKeySignatureDependency(signature);
  const dependencies = readOwnValues(value);
  return React.useMemo(() => value, [keySignatureDependency, ...dependencies]);
};

export const useMemoizedRouteBundle = <T extends object>(value: T): T => {
  const signature: KeySignatureEntry[] = [];
  const dependencies: DependencyValue[] = [];
  for (const key of Reflect.ownKeys(value)) {
    signature.push([0, key]);
    const routeProps = Reflect.get(value, key);
    if (!isDependencyValue(routeProps)) continue;

    if (typeof routeProps === "object" && routeProps !== null) {
      signature.push(
        ...Reflect.ownKeys(routeProps).map(
          (routeKey): KeySignatureEntry => [1, routeKey],
        ),
      );
      dependencies.push(...readOwnValues(routeProps));
      continue;
    }
    dependencies.push(routeProps);
  }
  const keySignatureDependency = useKeySignatureDependency(signature);
  return React.useMemo(() => value, [keySignatureDependency, ...dependencies]);
};
