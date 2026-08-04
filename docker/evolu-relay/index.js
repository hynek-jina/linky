// Local-dev Evolu relay. We run our own instead of the official
// evoluhq/relay image because that image hardcodes a 1MB-per-owner quota;
// pinned deps must stay protocol-compatible with the web app's
// @evolu/common version (see apps/web-app/package.json).
import { createConsole } from "@evolu/common";
import { createNodeJsRelay } from "@evolu/nodejs";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });
process.chdir("data");

const relay = await createNodeJsRelay({ console: createConsole() })({
  port: 4000,
  enableLogging: true,
  isOwnerWithinQuota: () => true,
});

if (!relay.ok) {
  console.error(relay.error);
  process.exit(1);
}
process.once("SIGINT", relay.value[Symbol.dispose]);
process.once("SIGTERM", relay.value[Symbol.dispose]);
