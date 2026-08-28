import { useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "./Chessboard";
import tacticLessonData from "./tacticLessons.json";
import "./ConceptExplorer.css";

function sideFromFen(fen: string) {
  return new Chess(fen).turn() === "w" ? "white" : "black";
}

function sideLabelFromFen(fen: string) {
  return sideFromFen(fen) === "white" ? "白方" : "黑方";
}

const endgameLessons = [
  { icon: "♖", title: "車兵殘局", text: "車放在通路兵後方；王先靠近中心，再從側面將軍。", fen: "8/5pk1/6p1/3R3p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先檢查雙方通路兵，車優先站到通路兵後面。", "王向中心靠近，但避免被對方車連續將軍。", "無法直接吃兵時，改由側面將軍逼王離開。"] },
  { icon: "♕", title: "后兵殘局", text: "先確保永將安全，再用后同時攻王與兵；避免無意義換后。", fen: "8/5pk1/6p1/3Q3p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先找將軍與雙攻，不要只推兵。", "讓自己的王避開連續將軍路線。", "領先時交換后，落後時保留后製造永將。"] },
  { icon: "♗", title: "同色象殘局", text: "把兵放在與自己象相反顏色的格子，讓象保有活動線。", fen: "8/5pk1/4b1p1/7p/3B3P/6P1/5PK1/8 w - - 0 1", steps: ["用象攻擊對手兵，同時保護自己的弱兵。", "自己的兵盡量放在與象相反顏色的格子。", "王先侵入對方兵鏈，再創造遠方通路兵。"] },
  { icon: "♝", title: "異色象殘局", text: "防守方可建立堡壘；進攻方需要第二個弱點或通路兵。", fen: "8/5pk1/6p1/2b4p/3B3P/6P1/5PK1/8 w - - 0 1", steps: ["防守方用象封鎖與自己象同色的入口格。", "進攻方不要急著換兵，要在兩翼製造弱點。", "只有一側兵時常可守和，先判斷是否需要轉換計畫。"] },
  { icon: "♘", title: "馬兵殘局", text: "固定對手兵後再封鎖；邊兵會降低馬的轉換速度。", fen: "8/5pk1/4n1p1/7p/3N3P/6P1/5PK1/8 w - - 0 1", steps: ["先把對手兵固定在馬可以攻擊的顏色。", "馬站在兵前方封鎖，王從另一側侵入。", "避免把馬困在邊線；每一步都要保留回中心的格子。"] },
  { icon: "♔", title: "王兵殘局", text: "計算對王、關鍵格與兵競速，王的每一步通常都不能浪費。", fen: "8/5pk1/6p1/7p/7P/6P1/5PK1/8 w - - 0 1", steps: ["先數清楚雙方兵升變需要幾步。", "用對王迫使對手讓出關鍵格。", "推兵前確認不會失去對王；能先走王通常先走王。"] },
];

const mateLessons = [
  { icon: "♕", title: "后王將殺", subtitle: "一步將殺", fen: "7k/8/5KQ1/8/8/8/8/8 w - - 0 1", goal: "白方走 Qg7#。后貼近對王，自己的王同時封住逃生格。" },
  { icon: "♖", title: "車王將殺", subtitle: "一步將殺", fen: "7k/5K2/8/8/8/8/8/R7 w - - 0 1", goal: "白方走 Rh1#。車切斷最後一排，王負責封住相鄰格。" },
  { icon: "♘♗", title: "馬象協力將殺", subtitle: "逼王入同色角", fen: "kB6/8/2K1N3/8/8/8/8/8 w - - 0 1", goal: "用馬控制跳格、主教封住同色斜線，逐步壓縮黑王；可展開 Stockfish 比較你的每一步。" },
];

const passedPawnLessons = [
  {
    icon: "♙♙♙",
    title: "三兵突破",
    subtitle: "三兵對三兵的經典突破",
    fen: "8/ppp5/8/PPP5/8/8/8/4K2k w - - 0 1",
    plan: ["先走中間兵 b6!，逼黑方的 a 兵或 c 兵吃向中間。", "若 ...axb6，走 c6，讓 c 兵成為通路兵；若 ...cxb6，則走 a6。", "不要先走邊兵，否則對手可以保持完整兵鏈並封鎖突破。"],
  },
  {
    icon: "♙♙",
    title: "二兵互換突破",
    subtitle: "用交換製造外側通路兵",
    fen: "8/8/pp6/8/PP6/8/8/4K2k w - - 0 1",
    plan: ["先找能迫使對方兵離開原線的交換。", "走 b5!；若 ...axb5，a 兵推進後就不再有同線敵兵阻擋。", "形成通路兵後，王要從另一側牽制對手王，避免只顧著連續推兵。"],
  },
  {
    icon: "♙♙♙",
    title: "三對二兵多數",
    subtitle: "王翼多一兵的標準製造法",
    fen: "8/6k1/6pp/8/5PPP/8/6K1/8 w - - 0 1",
    plan: ["先固定對手兵，再用三兵保持彼此保護，不要讓最前面的兵孤立。", "通常以 g5 或 h5 製造交換，留下另一條線的兵成為通路兵。", "王先靠近突破區；沒有王支援時，三對二也可能被完全封鎖。"],
  },
  {
    icon: "♙　♙",
    title: "遠方通路兵",
    subtitle: "在一翼製造兵，從另一翼入侵",
    fen: "8/p4pk1/6p1/7p/P6P/6P1/5PK1/8 w - - 0 1",
    plan: ["先判斷哪一翼能製造離雙王最遠的通路兵。", "遠方通路兵的目的不一定是升變，而是把對手王引離主要兵群。", "對手王離開後，自己的王立即吃掉另一翼弱兵，再回頭支援升變。"],
  },
];

type TacticLesson = {
  group: "戰術" | "技巧";
  icon: string;
  title: string;
  cue: string;
  steps: string[];
  exampleFen: string;
  example: string;
  exampleLine: string;
};

const tacticLessons = tacticLessonData as TacticLesson[];

export default function ConceptExplorer() {
  const [selectedEndgame, setSelectedEndgame] = useState(endgameLessons[0]);
  const [selectedMate, setSelectedMate] = useState(mateLessons[0]);
  const [selectedPassedPawn, setSelectedPassedPawn] = useState(passedPawnLessons[0]);
  const [selectedTactic, setSelectedTactic] = useState(tacticLessons[0]);
  const [activePhase, setActivePhase] = useState<"opening" | "middlegame" | "endgame" | "passed-pawn" | "checkmate" | "tactics">("opening");
  const phases = [
    { id: "opening" as const, roman: "Ⅰ", eyebrow: "OPENING", title: "開局下法", text: "控制中心、發展輕子、完成王的安全。不要為了吃兵而讓同一枚棋子重複移動。" },
    { id: "middlegame" as const, roman: "Ⅱ", eyebrow: "MIDDLEGAME", title: "中局下法", text: "先找兵突破與弱格，再改善最差的棋子。準備兩個以上攻擊子力後才正式動手。" },
    { id: "endgame" as const, roman: "Ⅲ", eyebrow: "ENDGAME", title: "殘局下法", text: "王走向中心、製造通路兵，並依剩餘子力改變計畫；不同殘局不能使用同一套口訣。" },
    { id: "passed-pawn" as const, roman: "Ⅳ", eyebrow: "PASSED PAWN", title: "創造通路兵", text: "用兵多數、交換與突破，清除同一路線上的敵兵，再讓王護送通路兵前進。" },
    { id: "checkmate" as const, roman: "Ⅴ", eyebrow: "CHECKMATE", title: "基礎將殺", text: "用后、車或馬象協力限制逃生格，逐步縮小敵王活動範圍並完成將殺。" },
    { id: "tactics" as const, roman: "Ⅵ", eyebrow: "TACTICS & TECHNIQUE", title: "基本戰術／技巧", text: "辨識閃將、牽制與雙攻，也練習扇形關馬、好壞象和改善棋子。" },
  ];
  return <section className="concept-explorer"><div className="concept-heading"><p className="eyebrow">CHESS THINKING</p><h2>中心思想</h2><p>不是只背開局名稱，而是知道每個階段該控制什麼、交換什麼，以及何時讓王加入戰鬥。</p></div>
    <div className="concept-phase-grid" role="tablist" aria-label="選擇學習階段">{phases.map((phase) => <button type="button" role="tab" aria-selected={activePhase === phase.id} className={activePhase === phase.id ? "active" : ""} key={phase.id} onClick={() => setActivePhase(phase.id)}><span>{phase.roman}</span><div><small>{phase.eyebrow}</small><h3>{phase.title}</h3></div><p>{phase.text}</p></button>)}</div>
    {activePhase === "opening" && <section className="opening-checklist phase-content"><div className="section-heading"><div><p className="eyebrow">OPENING CHECKLIST</p><h3>開局三個問題與具體解法</h3></div><small>每走一步依序檢查</small></div><div>
      <article><span>1</span><h4>控制中心</h4><ol><li><b>解決辦法 1：</b>用 e、d 兵佔領或攻擊 e4、d4、e5、d5。</li><li><b>解決辦法 2：</b>用馬放在 f3／c3（黑方 f6／c6）增加中心控制。</li><li><b>檢查：</b>對手若立刻推中心兵，我能交換、封鎖還是反擊？</li></ol></article>
      <article><span>2</span><h4>發展輕子</h4><ol><li><b>解決辦法 1：</b>先發展有自然好格的馬，避免同一枚棋子重複走。</li><li><b>解決辦法 2：</b>依兵形決定主教放 c4、b5、e2 或 g2，而不是只求出子。</li><li><b>檢查：</b>這步是否增加中心壓力，並為易位騰出位置？</li></ol></article>
      <article><span>3</span><h4>完成王的安全</h4><ol><li><b>解決辦法 1：</b>清空王與車之間的棋子，通常在第 6–10 手完成易位。</li><li><b>解決辦法 2：</b>對手中心尚未打開前，不要無理由推動王前方兵。</li><li><b>檢查：</b>中心若下一手打開，我的王會不會留在中線受攻？</li></ol></article>
    </div></section>}
    {activePhase === "middlegame" && <section className="opening-checklist middlegame-checklist phase-content"><div className="section-heading"><div><p className="eyebrow">MIDDLEGAME CHECKLIST</p><h3>中局三個問題與具體解法</h3></div><small>先評估，再動手</small></div><div>
      <article><span>1</span><h4>最差的棋子是哪一枚？</h4><ol><li><b>解決辦法 1：</b>把沒有活動線的馬、象或車移到能攻擊弱點的位置。</li><li><b>解決辦法 2：</b>若沒有直接戰術，優先改善最差棋子而不是無目的推兵。</li><li><b>檢查：</b>換位後它是否多控制格子、支援突破或保護王？</li></ol></article>
      <article><span>2</span><h4>突破點與目標在哪裡？</h4><ol><li><b>解決辦法 1：</b>找落後兵、孤兵、弱格與沒有兵保護的棋子。</li><li><b>解決辦法 2：</b>用 c、d、e、f 兵突破打開適合己方子力的線。</li><li><b>檢查：</b>突破後先打開的是我的車象，還是對手的子力？</li></ol></article>
      <article><span>3</span><h4>可以正式進攻了嗎？</h4><ol><li><b>解決辦法 1：</b>至少讓兩枚棋子共同攻擊同一弱點，再加入后或車。</li><li><b>解決辦法 2：</b>先計算對手的強制回應：將軍、吃子與直接威脅。</li><li><b>檢查：</b>攻擊若被擋住，我是否仍能安全撤回並維持局面？</li></ol></article>
    </div></section>}
    {activePhase === "passed-pawn" && <section className="passed-pawn-library phase-content"><div className="section-heading"><div><p className="eyebrow">4 · PASSED PAWN LAB</p><h3>創造通路兵棋盤練習</h3></div><small>從常見兵形練習突破、交換與王的支援</small></div>
      <div className="passed-pawn-practice-layout"><div className="passed-pawn-lesson-list">{passedPawnLessons.map((lesson) => <button className={selectedPassedPawn.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedPassedPawn(lesson)}><span>{lesson.icon}</span><div><b>{lesson.title}</b><small>{lesson.subtitle}</small></div></button>)}</div>
        <article className="passed-pawn-board-card"><header><div><p className="eyebrow">PLAYABLE POSITION</p><h3>{selectedPassedPawn.title}</h3></div><span>{sideLabelFromFen(selectedPassedPawn.fen)}走</span></header><Chessboard key={`${selectedPassedPawn.title}-${sideFromFen(selectedPassedPawn.fen)}`} line="" initialFen={selectedPassedPawn.fen} orientation={sideFromFen(selectedPassedPawn.fen)} interactive analysis /><div className="passed-pawn-plan"><b>通路兵計畫</b><ol>{selectedPassedPawn.plan.map((step) => <li key={step}>{step}</li>)}</ol></div></article>
      </div>
    </section>}
    {activePhase === "checkmate" && <section className="mate-library phase-content"><div className="section-heading"><div><p className="eyebrow">5 · CHECKMATE LAB</p><h3>基礎將殺棋盤練習</h3></div><small>選一種子力組合，在棋盤上完成將殺</small></div>
      <div className="mate-practice-layout"><div className="mate-lesson-list">{mateLessons.map((lesson) => <button className={selectedMate.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedMate(lesson)}><span>{lesson.icon}</span><div><b>{lesson.title}</b><small>{lesson.subtitle}</small></div></button>)}</div>
        <article className="mate-board-card"><header><div><p className="eyebrow">PLAYABLE POSITION</p><h3>{selectedMate.title}</h3></div><span>{sideLabelFromFen(selectedMate.fen)}走</span></header><Chessboard key={`${selectedMate.title}-${sideFromFen(selectedMate.fen)}`} line="" initialFen={selectedMate.fen} orientation={sideFromFen(selectedMate.fen)} interactive analysis /><p><b>練習目標：</b>{selectedMate.goal}</p></article>
      </div>
    </section>}
    {activePhase === "tactics" && <section className="tactics-library phase-content"><div className="section-heading"><div><p className="eyebrow">6 · TACTICS & TECHNIQUE</p><h3>基本戰術／技巧辨識</h3></div><small>先看局面特徵，再照步驟計算</small></div>
      <div className="tactics-practice-layout"><div className="tactic-groups">{["戰術", "技巧"].map((group) => <section key={group}><h4>{group === "戰術" ? "強制戰術" : "局面技巧"}</h4><div>{tacticLessons.filter((lesson) => lesson.group === group).map((lesson) => <button type="button" className={selectedTactic.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedTactic(lesson)}><span>{lesson.icon}</span><b>{lesson.title}</b></button>)}</div></section>)}</div>
        <article className="tactic-detail"><header><span>{selectedTactic.icon}</span><div><p className="eyebrow">{selectedTactic.group}</p><h3>{selectedTactic.title}</h3></div></header><p>{selectedTactic.cue}</p><div className="tactic-example"><div><p className="eyebrow">EXAMPLE POSITION</p><h4>可重播局面範例</h4><p>{selectedTactic.example}</p><p className="tactic-example-line"><b>範例走法</b><span>{selectedTactic.exampleLine}</span></p></div><Chessboard key={`${selectedTactic.title}-${selectedTactic.exampleLine}`} line={selectedTactic.exampleLine} initialFen={selectedTactic.exampleFen} orientation={sideFromFen(selectedTactic.exampleFen)} showControls /></div><h4>實戰辨識步驟</h4><ol>{selectedTactic.steps.map((step) => <li key={step}>{step}</li>)}</ol><aside><b>每回合先問：</b>我有將軍、吃子或直接威脅嗎？對手下一手又有什麼強制手段？</aside></article>
      </div>
    </section>}
    {activePhase === "endgame" && <div className="endgame-library phase-content"><div className="section-heading"><div><p className="eyebrow">ENDGAME LIBRARY</p><h3>不同殘局下法</h3></div><small>點選後開啟棋盤與 Stockfish</small></div><div>{endgameLessons.map((lesson) => <button className={selectedEndgame.title === lesson.title ? "active" : ""} key={lesson.title} onClick={() => setSelectedEndgame(lesson)}><span>{lesson.icon}</span><h4>{lesson.title}</h4><p>{lesson.text}</p></button>)}</div>
      <section className="endgame-lab"><div className="endgame-board"><Chessboard key={selectedEndgame.title} line="" initialFen={selectedEndgame.fen} interactive analysis /></div><aside><p className="eyebrow">PRACTICE POSITION</p><h3>{selectedEndgame.title}怎麼下</h3><ol>{selectedEndgame.steps.map((step) => <li key={step}>{step}</li>)}</ol><p>你可以自由走棋；綠框是 Stockfish 建議，按「←」可撤回上一步。</p></aside></section>
    </div>}
  </section>;
}
