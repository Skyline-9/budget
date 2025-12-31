// #region agent log
const logToBackend = (data: any) => {
  console.error("[FRONTEND]", JSON.stringify(data));
  fetch(window.location.origin + "/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).catch((e) => console.error("Log failed:", e));
};

logToBackend({ location: "main.tsx:5", message: "main.tsx module starting", hypothesisId: "G" });
// #endregion

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { API_BASE_URL, API_MODE } from "./api/config";

// #region agent log
logToBackend({
  location: "main.tsx:18",
  message: "Imports completed",
  apiBaseUrl: API_BASE_URL,
  apiMode: API_MODE,
  origin: window.location.origin,
  hypothesisId: "G,H"
});
// #endregion

// #region agent log
try {
  const rootElement = document.getElementById("root");
  logToBackend({
    location: "main.tsx:28",
    message: "About to render",
    rootExists: !!rootElement,
    hypothesisId: "G"
  });
  
  if (!rootElement) {
    throw new Error("Root element not found");
  }
  
  const root = ReactDOM.createRoot(rootElement);
  logToBackend({ location: "main.tsx:38", message: "React root created", hypothesisId: "G" });
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  logToBackend({ location: "main.tsx:46", message: "React render called", hypothesisId: "G" });
} catch (error) {
  logToBackend({
    location: "main.tsx:49",
    message: "Render error",
    error: String(error),
    errorName: error instanceof Error ? error.name : "Unknown",
    errorStack: error instanceof Error ? error.stack : undefined,
    hypothesisId: "G"
  });
  throw error;
}
// #endregion








