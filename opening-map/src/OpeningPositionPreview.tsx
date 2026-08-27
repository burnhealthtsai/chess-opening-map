import { Chess } from "chess.js";
import { createElement, useMemo } from "react";
import type { Opening } from "./types";

const pieceNames = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" } as const;

function lineMoves(line: string) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

export default function OpeningPositionPreview({ opening }: { opening: Opening }) {
  const position = useMemo(() => {
    const game = new Chess();
    for (const san of lineMoves(opening.mainline)) {
      try { game.move(san); } catch { break; }
    }
    const squares = game.board().flatMap((row) => row);
    return opening.side === "黑方" ? squares.reverse() : squares;
  }, [opening]);

  return <span className="opening-position-preview" aria-label={`${opening.title_zh}主線走完後局面`}><span className="preview-board cg-wrap" aria-hidden="true">{position.map((piece, index) => <span className={(Math.floor(index / 8) + index % 8) % 2 ? "dark" : "light"} key={index}>{piece && createElement("piece", { className: `${pieceNames[piece.type]} ${piece.color === "w" ? "white" : "black"}` })}</span>)}</span><i>主線走完後</i></span>;
}
