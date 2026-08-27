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

  function startAnalysis(position: string) {
    const worker = workerRef.current;
    if (!worker || !readyRef.current) return;
    worker.postMessage("stop");
    worker.postMessage(`position fen ${position}`);
    worker.postMessage("go depth 12");
    setAnalysis((current) => ({ ...current, status: "thinking", depth: 0, bestMove: null }));
  }

  useEffect(() => {
    fenRef.current = fen;
    if (enabled) startAnalysis(fen);
  }, [enabled, fen]);

  useEffect(() => {
    if (!enabled) return;
    const workerUrl = `${import.meta.env.BASE_URL}stockfish/stockfish-18-lite-single.js`;
    const worker = new Worker(workerUrl);
    workerRef.current = worker;
    setAnalysis(initialAnalysis);

    worker.onmessage = (event: MessageEvent<unknown>) => {
      const message = String(event.data);
      if (message === "uciok") {
        worker.postMessage("isready");
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
    worker.onerror = () => setAnalysis((current) => ({ ...current, status: "error" }));
    worker.postMessage("uci");

    return () => {
      readyRef.current = false;
      worker.postMessage("stop");
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  return analysis;
}
