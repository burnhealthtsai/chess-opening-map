import { useState } from "react";
import { Chessboard } from "./Chessboard";
import { gamesForOpening, openingMemory, phaseGuides } from "./openingKnowledge";
import { openingIcon } from "./openingIcon";
import type { Opening } from "./types";

type OpeningDetailProps = {
  opening: Opening;
  neighbours: Opening[];
  onSelect: (id: string) => void;
  onCopy: (line: string) => void;
  onClose: () => void;
};

export default function OpeningDetail({ opening, neighbours, onSelect, onCopy, onClose }: OpeningDetailProps) {
  const [activeLine, setActiveLine] = useState<"main" | number>("main");
  const [expandedGame, setExpandedGame] = useState<number | null>(null);
  const [practiceLevel, setPracticeLevel] = useState<1 | 2 | 3>(2);
  const [practiceOpen, setPracticeOpen] = useState(false);
  const selectedVariation = typeof activeLine === "number" ? opening.variations[activeLine] : null;
  const line = selectedVariation?.line ?? opening.mainline;
  const lineLength = lineMoves(line).length;
  const lineTitle = selectedVariation?.name ?? "官方辨識棋路";
  const famous = gamesForOpening(opening);
  const phases = phaseGuides(opening);
  const players = playersForOpening(opening);
  return <div className="detail-content"><button className="detail-close" onClick={onClose} aria-label="關閉開局詳情">×</button>
    <div className="detail-title"><div><p className="eyebrow">{opening.eco} · {opening.side}</p><h2>{openingIcon(opening.title_zh, opening.title_en) && <i className="opening-origin-icon" aria-hidden="true">{openingIcon(opening.title_zh, opening.title_en)}</i>}{opening.title_zh}</h2><p>{opening.title_en}</p></div><span className={`category ${opening.category === "趣味" ? "fun" : ""}`}>{opening.category}</span></div>
    <div className="tags">{opening.styles.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <div className="active-line-heading"><span>{activeLine === "main" ? "主" : Number(activeLine) + 1}</span><div><small>目前棋路</small><b>{lineTitle}</b></div></div>
    <Chessboard key={`${opening.id}-${activeLine}`} line={line} initialStep={lineLength} orientation={opening.side === "黑方" ? "black" : "white"} autoPlay autoPlayFromStep={0} interactive analysis />
    <section className="line-choices"><h3>這個開局怎麼形成</h3><p>官方辨識棋路停在足以確認名稱的局面；下方具名變例只顯示資料來源實際收錄的棋路。</p><div>
      <button className={activeLine === "main" ? "active" : ""} onClick={() => setActiveLine("main")}><span>主</span><b>官方辨識棋路</b><small>{opening.eco}</small></button>
      {opening.variations.slice(0, 3).map((variation, index) => <button className={activeLine === index ? "active" : ""} key={`${variation.name}-${index}`} onClick={() => setActiveLine(index)}><span>{index + 1}</span><b>{variation.name}</b><small>重點變例</small></button>)}
    </div></section>
    <section><div className="section-heading"><h3>{lineTitle}</h3><button onClick={() => void onCopy(line)}>複製 PGN</button></div><p className="mainline">{line}</p>{selectedVariation && <p className="variation-note">{selectedVariation.note}</p>}</section>
    <section><h3>核心構想</h3><p>{opening.ideas}</p></section>
    <section className="core-followups"><div className="section-heading"><div><p className="eyebrow">IMPORTANT CONTINUATIONS</p><h3>重要招法｜接下來怎麼下</h3></div><small>把構想變成下一步</small></div>
      <div className="core-plan-grid">{opening.plans.map((plan, index) => {
        const kind = corePlanKind(plan);
        const squares = corePlanSquares(plan);
        return <article className={`core-plan kind-${kind.id}`} key={`${plan}-${index}`}><header><span aria-hidden="true">{kind.icon}</span><b>{kind.label}</b></header><p>{plan}</p>{squares.length > 0 && <div className="target-squares" aria-label="關鍵格位">{squares.map((square) => <span key={square}>{square}</span>)}</div>}</article>;
      })}</div>
      {opening.mistakes.length > 0 && <aside className="plan-check"><b>動手前檢查</b><ul>{opening.mistakes.slice(0, 2).map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></aside>}
    </section>
    <section className="phase-roadmap"><div className="section-heading"><div><p className="eyebrow">GAME PLAN</p><h3>開局・中局・殘局下法</h3></div><small>依局勢階段切換計畫</small></div>
      <div className="phase-roadmap-grid">{phases.map((phase) => <article className={`phase-card phase-${phase.id}`} key={phase.id}>
        <header><span>{phase.icon}</span><div><small>{phase.eyebrow}</small><b>{phase.label}</b></div></header>
        <h4>{phase.title}</h4>
        <ul>{phase.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
      </article>)}</div>
    </section>
    <section className="memory-card"><p className="eyebrow">MEMORY</p><h3>名稱記憶｜為什麼叫這個名字？</h3><p>{openingMemory(opening)}</p></section>
    {players.length > 0 && <section className="player-profiles"><div className="section-heading"><div><p className="eyebrow">CHESS MASTERS</p><h3>著名西洋棋棋手介紹</h3></div><small>包含開局命名棋手</small></div><div>{players.map((player) => <article key={player.name}><span>{player.icon}</span><div><b>{player.name}</b><small>{player.years}</small><p>{player.summary}</p></div></article>)}</div></section>}
    <section className="variation-opponent"><div className="section-heading"><div><p className="eyebrow">VARIATION PRACTICE</p><h3>指定變例對手</h3></div><small>目前路線：{lineTitle}</small></div><p>對手會先沿目前選定棋路完成布局，再依等級接續陪你實戰。</p><div className="variation-levels">{([1, 2, 3] as const).map((level) => <button className={practiceLevel === level ? "active" : ""} onClick={() => setPracticeLevel(level)} key={level}>{level === 1 ? "入門 600" : level === 2 ? "進階 1200" : "高手 1800+"}</button>)}<button className="start-variation-practice" onClick={() => setPracticeOpen((value) => !value)}>{practiceOpen ? "收起對手棋盤" : `開始陪練｜${opening.title_zh}`}</button></div>{practiceOpen && <Chessboard key={`practice-${opening.id}-${activeLine}-${practiceLevel}`} line={line} initialStep={lineLength} interactive analysis showControls opponentLevel={practiceLevel} playerColor={opening.side === "黑方" ? "black" : "white"} orientation={opening.side === "黑方" ? "black" : "white"} />}</section>
    <section className="famous-games"><div className="section-heading"><div><p className="eyebrow">MASTER GAMES</p><h3>著名棋局</h3></div><small>最多 10 場</small></div>
      {famous.length ? <div className="famous-game-list">{famous.map((game, index) => <article key={`${game.event}-${game.year}`}>
        <button onClick={() => setExpandedGame((current) => current === index ? null : index)} aria-expanded={expandedGame === index}>
          <span>{game.year}</span><div><b>{game.white} — {game.black}</b><small>{game.event} · {game.site} · {game.result}</small></div><i>{expandedGame === index ? "收起" : "看棋譜"}</i>
        </button>
        {expandedGame === index && <div className="famous-game-line"><Chessboard line={game.line} interactive showControls /><p className="mainline">{game.line}</p></div>}
      </article>)}</div> : <p className="empty-games">這個細分開局目前沒有已核對的精選名局；保留空白比把相似棋局誤標成同一變例更可靠。</p>}
    </section>
    <section><h3>相近開局</h3><div className="neighbours">{neighbours.map((node) => <button key={node.id} onClick={() => onSelect(node.id)}><b>{openingIcon(node.title_zh, node.title_en) && <i className="opening-origin-icon" aria-hidden="true">{openingIcon(node.title_zh, node.title_en)}</i>}{node.title_zh}</b><span>{node.eco} · {node.styles.join("／")}</span></button>)}</div></section>
  </div>;
}

const playerProfiles = [
  { keys: ["西班牙", "Ruy Lopez"], name: "魯伊・洛佩斯", years: "約 1530–1580", icon: "♗", summary: "西班牙神父與早期棋理作者；西班牙開局以他的著作與研究聞名。" },
  { keys: ["阿廖欣", "Alekhine"], name: "亞歷山大・阿廖欣", years: "1892–1946", icon: "♞", summary: "第四任世界冠軍，以複雜進攻和深遠計算著稱，阿廖欣防禦以他命名。" },
  { keys: ["尼姆佐", "Nimzo"], name: "阿隆・尼姆佐維奇", years: "1886–1935", icon: "♞", summary: "超現代棋派代表，強調封鎖、過度保護與遠距離控制中心。" },
  { keys: ["列蒂", "Réti"], name: "理查・列蒂", years: "1889–1929", icon: "♘", summary: "超現代開局先驅，以彈性發展與側翼控制中心聞名。" },
  { keys: ["菲利多", "Philidor"], name: "弗朗索瓦・菲利多", years: "1726–1795", icon: "♟", summary: "提出『兵是西洋棋的靈魂』，菲利多防禦與多個經典殘局以他命名。" },
  { keys: ["彼得羅夫", "Petrov"], name: "亞歷山大・彼得羅夫", years: "1794–1867", icon: "♞", summary: "俄羅斯棋手與作家，彼得羅夫防禦以對稱、穩健和精確反擊著稱。" },
  { keys: ["塔拉什", "Tarrasch"], name: "西格伯特・塔拉什", years: "1862–1934", icon: "♙", summary: "古典棋理大師，強調中心、發展與空間；多個塔拉什變例承襲其思想。" },
  { keys: ["馬歇爾", "Marshall"], name: "法蘭克・馬歇爾", years: "1877–1944", icon: "♛", summary: "美國進攻型大師，西班牙開局的馬歇爾攻擊是其著名武器。" },
  { keys: ["伯德", "Bird"], name: "亨利・伯德", years: "1830–1908", icon: "♙", summary: "英國棋手，伯德開局以 1.f4 立即爭奪 e5 格。" },
  { keys: ["倫敦", "London", "魯賓斯坦", "Rubinstein"], name: "阿基巴・魯賓斯坦", years: "1882–1961", icon: "♖", summary: "以精準位置棋與車兵殘局著稱；多個魯賓斯坦體系和變例以他命名。" },
];

function playersForOpening(opening: Opening) {
  const text = `${opening.title_zh} ${opening.title_en}`;
  return playerProfiles.filter((player) => player.keys.some((key) => text.includes(key))).slice(0, 4);
}

function lineMoves(line: string) {
  return line.split(/\s+/).filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

function corePlanSquares(plan: string) {
  return [...new Set(plan.match(/\b[a-h][1-8]\b/gi) ?? [])];
}

function corePlanKind(plan: string) {
  if (/易位|王安全|王仍|保護王/.test(plan)) return { id: "safe", label: "王安全", icon: "♔" };
  if (/攻|逼|弱點|突破|壓力|威脅/.test(plan)) return { id: "attack", label: "攻擊時機", icon: "⚔" };
  if (/發展|子力|車|出子|活化/.test(plan)) return { id: "develop", label: "子力發展", icon: "♞" };
  return { id: "control", label: "格位控制", icon: "◎" };
}
