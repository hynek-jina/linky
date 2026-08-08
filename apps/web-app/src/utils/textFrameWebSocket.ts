// nostr-tools parses every incoming frame as JSON text and throws an uncaught
// TypeError on binary data — which arrives when a configured relay URL is not
// actually a Nostr relay (e.g. an Evolu sync relay). This subclass shadows
// `onmessage` with an instance accessor so the handler only ever sees string
// frames; binary frames are dropped.
export class TextFrameWebSocket extends WebSocket {
  constructor(...args: ConstructorParameters<typeof WebSocket>) {
    super(...args);

    let handler: ((this: WebSocket, ev: MessageEvent) => void) | null = null;
    Object.defineProperty(this, "onmessage", {
      get: () => handler,
      set: (value: ((this: WebSocket, ev: MessageEvent) => void) | null) => {
        handler = value;
      },
    });
    this.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      handler?.call(this, event);
    });
  }
}
