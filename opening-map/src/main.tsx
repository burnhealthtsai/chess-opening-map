import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./AppErrorBoundary";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>);
