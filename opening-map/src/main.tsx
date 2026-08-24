import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installPieceThemes } from "./pieceThemes";
import "@lichess-org/chessground/assets/chessground.cburnett.css";
import "./styles.css";

installPieceThemes();
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
