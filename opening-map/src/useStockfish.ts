import { Chess } from "chess.js";
import { useEffect, useRef, useState } from "react";

export type StockfishAnalysis = {
  status: "loading" | "thinking" | "ready" | "error";
  depth: number;
  score: number | null;
  mate: number | null;
  bestMove: string | null;
};

const initialAnalysis: StockfishAnalysis = {
  status: "loading",
  depth: 0,
  score: null,
  mate: null,
  bestMove: null,
};

export function useStockfish(fen: string, enabled: boolean) {
  const [analysis, setAnalysis] = useState<StockfishAnalysis>(initialAnalysis);
  const workerRef = useRef<Worker | null>(null);
  const readyRef = useRef(false);
  const fenRef = useRef(fen);

  function markEngineUnavailable() {
    readyRef.current = false;
    setAnalysis((current) => ({ ...current, status: "error" }));
  }

  function sendCommand(worker: Worker, command: string) {
    try {
      worker.postMessage(command);
      return true;
    } catch {
      markEngineUnavailable();
      return false;
    }
  }

  function startAnalysis(position: string) {
    const worker = workerRef.current;
    if (!worker || !readyRef.current) return;
    if (!sendCommand(worker, "stop")) return;
    if (!sendCommand(worker, `position fen ${position}`)) return;
    if (!sendCommand(worker, "go depth 12")) return;
    setAnalysis((current) => ({ ...current, status: "thinking", depth: 0, bestMove: null }));
  }

  useEffect(() => {
    fenRef.current = fen;
    if (enabled) startAnalysis(fen);
    else setAnalysis(initialAnalysis);
  }, [enabled, fen]);

  useEffect(() => {
    if (!enabled) return;
    const workerUrl = `${import.meta.env.BASE_URL}stockfish/stockfish-18-lite-single.js`;
    let active = true;
    let worker: Worker;
    try {
      worker = new Worker(workerUrl);
    } catch {
      workerRef.current = null;
      markEngineUnavailable();
      return;
    }
    workerRef.current = worker;
    setAnalysis(initialAnalysis);

    worker.onmessage = (event: MessageEvent<unknown>) => {
      if (!active) return;
      const message = String(event.data);
      if (message === "uciok") {
        sendCommand(worker, "isready");
        return;
      }
      if (message === "readyok") {
        readyRef.current = true;
        startAnalysis(fenRef.current);
        return;
      }
      if (message.startsWith("info ")) {
        const depth = Number(message.match(/\bdepth (\d+)/)?.[1] ?? 0);
        const scoreMatch = message.match(/\bscore (cp|mate) (-?\d+)/);
        const pvMove = message.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null;
        if (!scoreMatch) return;
        const direction = new Chess(fenRef.current).turn() === "w" ? 1 : -1;
        const value = Number(scoreMatch[2]) * direction;
        setAnalysis({
          status: "thinking",
          depth,
          score: scoreMatch[1] === "cp" ? value / 100 : null,
          mate: scoreMatch[1] === "mate" ? value : null,
          bestMove: pvMove,
        });
        return;
      }
      if (message.startsWith("bestmove")) {
        const bestMove = message.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/)?.[1] ?? null;
        setAnalysis((current) => ({ ...current, status: "ready", bestMove: bestMove ?? current.bestMove }));
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (active) markEngineUnavailable();
    };
    sendCommand(worker, "uci");

    return () => {
      active = false;
      readyRef.current = false;
      workerRef.current = null;
      worker.onmessage = null;
      worker.onerror = (event) => { event.preventDefault(); };
      try { worker.postMessage("stop"); } catch { /* The worker may already be unavailable. */ }
      try { worker.postMessage("quit"); } catch { /* The worker may already be unavailable. */ }
      window.setTimeout(() => {
        try { worker.terminate(); } catch { /* Termination is best-effort during cleanup. */ }
      }, 50);
    };
  }, [enabled]);

  return analysis;
}
