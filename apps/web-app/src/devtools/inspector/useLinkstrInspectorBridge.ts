import {
  inspectorEventsAtom,
  inspectorHandlerAtom,
  useAtomMount,
  useAtomSet,
} from "@linky/linkstr-react";
import React from "react";
import { useInspectorEnabled } from "./inspectorEnabled";
import { linkstrEventToRow } from "./linkstrRows";
import { reportInspectorRows } from "./reportInspectorRows";

export const useLinkstrInspectorBridge = () => {
  const inspectorEnabled = useInspectorEnabled();
  const setHandler = useAtomSet(inspectorHandlerAtom);
  useAtomMount(inspectorEventsAtom);

  React.useEffect(() => {
    if (!inspectorEnabled) return;
    setHandler({
      onEvent: (event) =>
        reportInspectorRows([linkstrEventToRow(event, Date.now())]),
    });
    return () => setHandler(null);
  }, [inspectorEnabled, setHandler]);
};
