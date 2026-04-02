import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CashuPage from "./CashuPage";
import "../index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing root container");
}

createRoot(container).render(
  <StrictMode>
    <CashuPage />
  </StrictMode>,
);
