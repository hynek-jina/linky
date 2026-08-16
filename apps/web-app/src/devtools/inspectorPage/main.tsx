import { createRoot } from "react-dom/client";

import { InspectorApp } from "./InspectorApp";
import { createHttpInspectorDataSource } from "./inspectorDataSource";
import "./inspector.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Inspector root element was not found");
}

createRoot(root).render(
  <InspectorApp dataSource={createHttpInspectorDataSource()} />,
);
