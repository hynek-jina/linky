import {
  inspectorEventsAtom,
  inspectorHandlerAtom,
  useAtomMount,
  useAtomSet,
} from "@linky/linkstr-react";
import React from "react";
import { linkstrEventToRow } from "./linkstrRows";
import { reportInspectorRows } from "./reportInspectorRows";

/**
 * Forwards linkstr inspector events to the dev collector as timestamped rows.
 * Inert in production: the handler is never set and the reporter no-ops.
 */
export const useLinkstrInspectorBridge = () => {
  const setHandler = useAtomSet(inspectorHandlerAtom);
  useAtomMount(inspectorEventsAtom);

  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    setHandler({
      onEvent: (event) =>
        reportInspectorRows([linkstrEventToRow(event, Date.now())]),
    });
    return () => setHandler(null);
  }, [setHandler]);
};
