// Re-export the effect-atom react surface so app code consumes the atoms
// below via useAtomSet/useAtomValue without depending on the 0.x library.
export * from "@effect-atom/atom-react";

export * from "./config";
export * from "./errors";
export * from "./inbox";
export * from "./inspector";
export * from "./reactions";
export * from "./runtime";
