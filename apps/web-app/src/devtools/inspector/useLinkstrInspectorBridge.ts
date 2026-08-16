import {
  inspectorEventsAtom,
  inspectorHandlerAtom,
  useAtomMount,
  useAtomSet,
} from "@linky/linkstr-react";
import React from "react";
import { useInspectorEmissionEnabled } from "./inspectorEnabled";
import { linkstrEventToRow } from "./linkstrRows";
import { reportInspectorRows } from "./reportInspectorRows";

export const useLinkstrInspectorBridge = () => {
  const inspectorEmissionEnabled = useInspectorEmissionEnabled();
  const setHandler = useAtomSet(inspectorHandlerAtom);
  useAtomMount(inspectorEventsAtom);

  React.useEffect(() => {
    if (!inspectorEmissionEnabled) return;
    setHandler({
      onEvent: (event) =>
        reportInspectorRows([linkstrEventToRow(event, Date.now())]),
    });
    return () => setHandler(null);
  }, [inspectorEmissionEnabled, setHandler]);
};
