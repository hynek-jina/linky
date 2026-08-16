import {
  INSPECTOR_CLEAR_PATH,
  INSPECTOR_STREAM_PATH,
  parseCollectedInspectorRow,
  type CollectedInspectorRow,
} from "../inspector/inspectorRows";
import type { InspectorStore } from "../inspector/inspectorStore";

export interface InspectorDataSourceHandlers {
  onClear: () => void;
  onConnectionChange: (connected: boolean) => void;
  onRows: (rows: CollectedInspectorRow[]) => void;
}

export interface InspectorDataSource {
  clear: () => Promise<void>;
  connect: (handlers: InspectorDataSourceHandlers) => () => void;
}

export const createHttpInspectorDataSource = (): InspectorDataSource => ({
  clear: async () => {
    await fetch(INSPECTOR_CLEAR_PATH, { method: "POST" });
  },
  connect(handlers) {
    const source = new EventSource(INSPECTOR_STREAM_PATH);
    source.onopen = () => handlers.onConnectionChange(true);
    source.onerror = () => handlers.onConnectionChange(false);
    source.onmessage = (message) => {
      try {
        const parsedJson: unknown = JSON.parse(message.data);
        const row = parseCollectedInspectorRow(parsedJson);
        if (row) handlers.onRows([row]);
      } catch {
        // Malformed frames are ignored; the shared parser validates all fields.
      }
    };

    return () => source.close();
  },
});

export const createInMemoryInspectorDataSource = (
  store: InspectorStore,
): InspectorDataSource => ({
  clear: () => {
    store.clear();
    return Promise.resolve();
  },
  connect(handlers) {
    handlers.onConnectionChange(true);
    const unsubscribe = store.subscribe((change) => {
      if (change.kind === "clear") {
        handlers.onClear();
        return;
      }
      handlers.onRows(change.rows);
    });
    handlers.onRows(store.query().rows);
    return unsubscribe;
  },
});
