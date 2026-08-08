import { describe, expect, it, vi } from "vitest";
import { TextFrameWebSocket } from "./textFrameWebSocket";

const createSocket = () => new TextFrameWebSocket("ws://127.0.0.1:1");

describe("TextFrameWebSocket", () => {
  it("delivers text frames to the onmessage handler", () => {
    const ws = createSocket();
    const handler = vi.fn();
    ws.onmessage = handler;

    const event = new MessageEvent("message", { data: '["EVENT","sub"]' });
    ws.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it("drops binary frames instead of delivering them", () => {
    const ws = createSocket();
    const handler = vi.fn();
    ws.onmessage = handler;

    ws.dispatchEvent(
      new MessageEvent("message", { data: new Blob(["binary"]) }),
    );
    ws.dispatchEvent(new MessageEvent("message", { data: new ArrayBuffer(8) }));

    expect(handler).not.toHaveBeenCalled();
  });

  it("reads back the assigned handler and supports clearing it", () => {
    const ws = createSocket();
    const handler = vi.fn();

    ws.onmessage = handler;
    expect(ws.onmessage).toBe(handler);

    ws.onmessage = null;
    ws.dispatchEvent(new MessageEvent("message", { data: "text" }));
    expect(handler).not.toHaveBeenCalled();
  });
});
