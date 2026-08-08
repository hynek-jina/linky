import { AbstractSimplePool } from "nostr-tools/pool";
import { verifyEvent } from "nostr-tools/pure";
import { TextFrameWebSocket } from "../../utils/textFrameWebSocket";

interface CreateNostrPoolOptions {
  enablePing?: boolean;
  enableReconnect: boolean;
}

// SimplePool hardwires the global WebSocket, so build the pool from
// AbstractSimplePool to plug in TextFrameWebSocket (nostr-tools crashes on
// binary frames from non-Nostr endpoints). maxWaitForConnection mirrors
// SimplePool's default.
export const createNostrPool = (
  options: CreateNostrPoolOptions,
): AbstractSimplePool =>
  new AbstractSimplePool({
    verifyEvent,
    websocketImplementation: TextFrameWebSocket,
    maxWaitForConnection: 3000,
    ...options,
  });
