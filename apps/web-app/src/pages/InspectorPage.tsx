import React from "react";

import { clientInspectorStore } from "../devtools/inspector/clientInspectorStore";
import { InspectorApp } from "../devtools/inspectorPage/InspectorApp";
import { createInMemoryInspectorDataSource } from "../devtools/inspectorPage/inspectorDataSource";
import "../devtools/inspectorPage/inspector.css";

export default function InspectorPage(): React.ReactElement {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const dataSource = React.useMemo(
    () => createInMemoryInspectorDataSource(clientInspectorStore),
    [],
  );

  return (
    <div
      className={`in-app-inspector-page${isFullscreen ? " fullscreen" : ""}`}
    >
      <InspectorApp
        dataSource={dataSource}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((current) => !current)}
      />
    </div>
  );
}
