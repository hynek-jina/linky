import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import { evolu, EvoluProvider } from "./evolu.ts";
import "./index.css";

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EvoluProvider value={evolu}>
      <App />
    </EvoluProvider>
  </StrictMode>
);
