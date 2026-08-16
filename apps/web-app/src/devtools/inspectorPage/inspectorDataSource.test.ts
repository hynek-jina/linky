import { describe, expect, it, vi } from "vitest";

import type { InspectorRow } from "../inspector/inspectorRows";
import { createInspectorStore } from "../inspector/inspectorStore";
import { createInMemoryInspectorDataSource } from "./inspectorDataSource";

const row = (tag: string): InspectorRow => ({
  at: 1_700_000_000_000,
  channel: "wire",
  tag,
  summary: tag,
  links: {},
  payload: { tag },
});

describe("createInMemoryInspectorDataSource", () => {
  it("replays buffered rows and streams appends and clears", async () => {
    const store = createInspectorStore();
    store.append("tab", [row("buffered")]);
    const source = createInMemoryInspectorDataSource(store);
    const receivedTags: string[] = [];
    const onClear = vi.fn();
    const onConnectionChange = vi.fn();

    const disconnect = source.connect({
      onClear,
      onConnectionChange,
      onRows: (rows) => {
        receivedTags.push(...rows.map((entry) => entry.tag));
      },
    });

    store.append("tab", [row("live")]);
    await source.clear();

    expect(onConnectionChange).toHaveBeenCalledWith(true);
    expect(receivedTags).toEqual(["buffered", "live"]);
    expect(onClear).toHaveBeenCalledOnce();
    expect(store.query().rows).toEqual([]);

    disconnect();
    store.append("tab", [row("disconnected")]);
    expect(receivedTags).toEqual(["buffered", "live"]);
  });
});
