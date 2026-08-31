import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "..", "openings.yaml");
const variationsSource = resolve(root, "..", "variations.json");
const destination = resolve(root, "public", "opening-map.json");
const detailsDestination = resolve(root, "public", "opening-details.json");
const explorersDestination = resolve(root, "public", "opening-explorers.json");
const variationNotesDestination = resolve(root, "public", "opening-variation-notes.json");
const schemaVersion = 10;

export function buildCatalogRevision(catalog, variationCatalog = { variations: [] }) {
  return createHash("sha256").update(JSON.stringify([catalog, variationCatalog])).digest("hex");
}

export function sanMoves(line) {
  return line
    .replace(/\{[^}]*\}|\([^)]*\)|\$\d+/g, "")
    .trim()
    .split(/\s+/)
    .filter((token) => !/^\d+\.(\.\.)?$/.test(token) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token));
}

function familyGroup(item) {
  const moves = sanMoves(item.mainline);
  const firstMove = firstMoveGroup(moves[0]);
  const reply = moves[1] ?? "起手";
  const labels = {
    e4: "王兵起手",
    d4: "后兵起手",
    c4: "英式起手",
    Nf3: "列蒂起手",
    "其他": "不規則起手",
  };
  const specificFirstMove = moves[0] ?? "?";
  return firstMove === "其他"
    ? { id: `${firstMove}-${specificFirstMove}-${reply}`, label: `${labels[firstMove]} · ${specificFirstMove} …${reply}` }
    : { id: `${firstMove}-${reply}`, label: `${labels[firstMove] ?? firstMove} · …${reply}` };
}

function firstMoveGroup(move) {
  return ["e4", "d4", "c4", "Nf3"].includes(move) ? move : "其他";
}

function subgroupFor(firstMove, firstMoveSan, replySan) {
  const move = firstMove === "其他" ? firstMoveSan : replySan;
  if (/^N/.test(move)) return { id: "knight", label: firstMove === "其他" ? "馬類發展" : "馬類回應" };
  if (/^[de]/.test(move)) return { id: "center", label: firstMove === "其他" ? "中央預備" : "中央兵回應" };
  if (/^[abc]/.test(move)) return { id: "queen-wing", label: firstMove === "其他" ? "后翼兵起手" : "后翼兵回應" };
  if (/^[fgh]/.test(move)) return { id: "king-wing", label: firstMove === "其他" ? "王翼兵起手" : "王翼兵回應" };
  return { id: "other", label: "其他棋路" };
}

function sharedPrefix(a, b) {
  const left = sanMoves(a.mainline);
  const right = sanMoves(b.mainline);
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function ecoBand(eco) {
  return `${eco[0]}${Math.floor(Number(eco.slice(1)) / 10)}`;
}

function familyScore(a, b) {
  const prefix = sharedPrefix(a, b);
  const firstA = firstMoveGroup(sanMoves(a.mainline)[0]);
  const firstB = firstMoveGroup(sanMoves(b.mainline)[0]);
  return (firstA === firstB ? 16 : 0)
    + (a.eco[0] === b.eco[0] ? 7 : 0)
    + (ecoBand(a.eco) === ecoBand(b.eco) ? 10 : 0)
    + Math.min(prefix, 6) * 9;
}

function styleScore(a, b) {
  const sharedStyles = a.styles.filter((style) => b.styles.includes(style)).length;
  const firstA = firstMoveGroup(sanMoves(a.mainline)[0]);
  const firstB = firstMoveGroup(sanMoves(b.mainline)[0]);
  return sharedStyles * 12
    + (firstA === firstB ? 6 : 0)
    + (a.side === b.side ? 3 : 0)
    + (a.category === b.category ? 2 : 0);
}

function strongestEdges(items, scorer) {
  const candidates = new Map();
  for (const item of items) {
    const ranked = items
      .filter((other) => other.id !== item.id)
      .map((other) => ({ other, score: scorer(item, other) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.other.title_zh.localeCompare(b.other.title_zh, "zh-Hant"))
      .slice(0, 3);
    for (const { other, score } of ranked) {
      const [source, target] = [item.id, other.id].sort();
      const key = `${source}:${target}`;
      const prior = candidates.get(key);
      if (!prior || prior.weight < score) candidates.set(key, { source, target, weight: score });
    }
  }
  return [...candidates.values()];
}

function fenKey(chess) {
  return chess.fen().split(" ").slice(0, 4).join(" ");
}

function numberedLine(moves) {
  const tokens = [];
  for (let index = 0; index < moves.length; index += 2) {
    tokens.push(`${Math.floor(index / 2) + 1}.`, moves[index]);
    if (moves[index + 1]) tokens.push(moves[index + 1]);
  }
  return tokens.join(" ");
}

function routePosition(line) {
  const chess = new Chess();
  for (const move of sanMoves(line)) chess.move(move);
  return fenKey(chess);
}

const curatedTranspositions = [
  {
    id: "reti-english-catalan-qgd",
    title: "列蒂・英式・加泰隆・后翼棄兵",
    summary: "白方可以先走 Nf3、c4 或 d4，最後進入相同的加泰隆／后翼棄兵配置。",
    memberIds: ["w-reti-opening", "w-english-opening", "w-catalan-opening", "b-queens-gambit-declined"],
    routes: [
      ["列蒂走法", "1. Nf3 d5 2. c4 e6 3. g3 Nf6 4. Bg2 Be7 5. d4 O-O", "w-reti-opening"],
      ["加泰隆走法", "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 Be7 5. Nf3 O-O", "w-catalan-opening"],
      ["英式走法", "1. c4 e6 2. Nf3 d5 3. g3 Nf6 4. Bg2 Be7 5. d4 O-O", "w-english-opening"],
      ["后翼棄兵順序", "1. d4 d5 2. c4 e6 3. Nf3 Nf6 4. g3 Be7 5. Bg2 O-O", "b-queens-gambit-declined"],
    ],
  },
  {
    id: "slav-semi-slav-meran",
    title: "斯拉夫・半斯拉夫・梅蘭",
    summary: "…d5、…c6、…Nf6、…e6 的順序可以互換，抵達同一個半斯拉夫分岔點。",
    memberIds: ["b-slav-defense", "b-semi-slav-defense", "b-semi-slav-defense-meran-variation"],
    routes: [
      ["斯拉夫順序", "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6", "b-slav-defense"],
      ["印度順序", "1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 c6", "b-semi-slav-defense"],
      ["梅蘭進入順序", "1. d4 d5 2. c4 c6 3. Nc3 Nf6 4. Nf3 e6", "b-semi-slav-defense-meran-variation"],
    ],
  },
  {
    id: "kings-indian-grunfeld-flex",
    title: "王翼印度・格林菲爾德・新格林菲爾德",
    summary: "白方先走 Nc3、Nf3 或從英式起手，都能進入黑方尚未決定…d5或…d6的共同配置。",
    memberIds: ["b-kings-indian-defense", "b-grunfeld-defense", "b-neo-grunfeld-defense", "w-english-opening"],
    routes: [
      ["后兵順序", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. Nf3", "b-kings-indian-defense"],
      ["先出王馬", "1. d4 Nf6 2. Nf3 g6 3. c4 Bg7 4. Nc3", "b-neo-grunfeld-defense"],
      ["格林菲爾德入口", "1. d4 Nf6 2. c4 g6 3. Nf3 Bg7 4. Nc3", "b-grunfeld-defense"],
      ["英式順序", "1. c4 Nf6 2. d4 g6 3. Nc3 Bg7 4. Nf3", "w-english-opening"],
    ],
  },
  {
    id: "pirc-modern",
    title: "皮爾茨・現代防禦",
    summary: "先走…d6或…g6都能合流；當…Nf6、…g6、…Bg7、…d6全部完成時，局面完全相同。",
    memberIds: ["b-pirc-defense", "b-modern-defense"],
    routes: [
      ["皮爾茨順序", "1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7", "b-pirc-defense"],
      ["現代防禦順序", "1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. Nf3 Nf6", "b-modern-defense"],
    ],
  },
  {
    id: "old-indian-kings-indian",
    title: "古印度・王翼印度",
    summary: "古印度的…d6入口若接著…g6、…Bg7，會轉成王翼印度；保留…Be7才維持古印度特色。",
    memberIds: ["b-old-indian-defense", "b-kings-indian-defense"],
    routes: [
      ["古印度入口", "1. d4 Nf6 2. c4 d6 3. Nc3 g6 4. e4 Bg7", "b-old-indian-defense"],
      ["王翼印度順序", "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6", "b-kings-indian-defense"],
    ],
  },
  {
    id: "english-benoni",
    title: "英式・別諾尼",
    summary: "1.c4先手與1.d4先手可藉由d4、c4、…Nf6、…c5互換順序，進入同一別諾尼中心。",
    memberIds: ["w-english-opening", "b-benoni-defense", "b-benoni-defense-modern"],
    routes: [
      ["英式順序", "1. c4 Nf6 2. d4 c5 3. d5 e6", "w-english-opening"],
      ["先走…e6轉入", "1. d4 e6 2. c4 c5 3. d5 Nf6", "b-benoni-defense"],
      ["別諾尼順序", "1. d4 Nf6 2. c4 c5 3. d5 e6", "b-benoni-defense-modern"],
    ],
  },
];

function buildCuratedTranspositions(openingIds) {
  return curatedTranspositions.map((group) => {
    const routes = group.routes.map(([label, line, openingId]) => ({ label, line, openingId }));
    const positions = new Set(routes.map((route) => routePosition(route.line)));
    if (positions.size !== 1) throw new Error(`${group.id}: transposition routes do not reach the same position`);
    const memberIds = group.memberIds.filter((id) => openingIds.has(id));
    if (memberIds.length < 2) throw new Error(`${group.id}: missing opening members`);
    return { ...group, relation: "exact", targetFen: [...positions][0], memberIds, routes, source: "curated" };
  });
}

function buildAutomaticTranspositions(openingById, variations) {
  const positions = new Map();
  for (const variation of variations) {
    if (!openingById.has(variation.opening_id)) continue;
    const chess = new Chess();
    const moves = sanMoves(variation.line);
    for (let index = 0; index < moves.length; index += 1) {
      chess.move(moves[index]);
      if (index < 4) continue;
      const key = fenKey(chess);
      const routes = positions.get(key) ?? [];
      routes.push({
        label: variation.name,
        line: numberedLine(moves.slice(0, index + 1)),
        openingId: variation.opening_id,
        depth: index + 1,
      });
      positions.set(key, routes);
    }
  }
  const candidates = [];
  for (const [targetFen, rawRoutes] of positions) {
    const uniqueRoutes = [...new Map(rawRoutes.map((route) => [route.line, route])).values()];
    const memberIds = [...new Set(uniqueRoutes.map((route) => route.openingId))];
    if (memberIds.length < 2 || uniqueRoutes.length < 2) continue;
    const byMember = [...new Map(uniqueRoutes.map((route) => [route.openingId, route])).values()].slice(0, 4);
    if (new Set(byMember.map((route) => route.line)).size < 2) continue;
    candidates.push({ targetFen, memberIds, routes: byMember, depth: Math.max(...byMember.map((route) => route.depth)) });
  }
  const deepestByMembers = new Map();
  for (const candidate of candidates) {
    const signature = [...candidate.memberIds].sort().join(":");
    const current = deepestByMembers.get(signature);
    if (!current || candidate.depth > current.depth) deepestByMembers.set(signature, candidate);
  }
  return [...deepestByMembers.values()]
    .sort((a, b) => b.memberIds.length - a.memberIds.length || b.routes.length - a.routes.length || b.depth - a.depth)
    .slice(0, 12)
    .map((candidate, index) => {
      const memberTitles = candidate.memberIds.map((id) => normalizedChineseTitle(openingById.get(id)));
      return {
        id: `official-transposition-${index + 1}`,
        title: memberTitles.join("・"),
        summary: `${memberTitles.join("、")}的不同官方棋路抵達完全相同的局面；可比較走子順序如何隱藏或延後開局選擇。`,
        relation: "exact",
        targetFen: candidate.targetFen,
        memberIds: candidate.memberIds,
        routes: candidate.routes.map(({ depth: _depth, ...route }) => route),
        source: "lichess-epd",
      };
    });
}

export function buildTranspositionGroups(catalog, variationCatalog = { variations: [] }) {
  const openingById = new Map(catalog.openings.map((opening) => [opening.id, opening]));
  const openingIds = new Set(openingById.keys());
  return [
    ...buildCuratedTranspositions(openingIds),
    ...buildAutomaticTranspositions(openingById, variationCatalog.variations ?? []),
  ];
}

const curatedAnalogies = [
  {
    id: "sicilian-english-reversed",
    title: "西西里防禦 ↔ 英格蘭開局",
    relation: "reversed",
    summary: "英格蘭開局的 1.c4 e5 常被稱為反色西西里：白方用側翼 c 兵挑戰中心，得到西西里型的不對稱局面。",
    blackIds: ["b-sicilian-defense", "b-sicilian-defense-dragon-variation"],
    whiteIds: ["w-english-opening", "w-english-opening-four-knights-system"],
    sharedIdeas: ["c 兵從側翼挑戰中心", "不對稱兵形與兩翼競爭", "保留 d 兵，等待 d4／…d5 突破"],
    difference: "英格蘭開局由白方先走，多一個先手，但對手的配置也不同；可移植兵形判斷與突破時機，不能逐手照抄西西里主線。",
    examples: {
      black: { openingId: "b-sicilian-defense", label: "西西里中心交換", line: "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4" },
      white: { openingId: "w-english-opening", label: "反色西西里兵形", line: "1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5" },
    },
  },
  {
    id: "kings-indian-defense-attack",
    title: "王翼象翼防禦群 ↔ 王翼印度攻擊",
    relation: "reversed",
    summary: "王翼印度、皮爾茨與現代防禦都以 …g6、…Bg7、…d6 遠距離壓迫中心；王翼印度攻擊將這套配置反色為 Nf3、g3、Bg2、d3、e4。",
    blackIds: ["b-kings-indian-defense", "b-kings-indian-defense-orthodox-variation", "b-pirc-defense", "b-modern-defense"],
    whiteIds: ["w-kings-indian-attack", "w-kings-indian-attack-with-e6"],
    sharedIdeas: ["王翼象翼與安全易位", "先讓對手建立中心再反擊", "以 e、f 兵推進製造王翼攻勢"],
    difference: "王翼印度通常對抗 d4、c4 中心，皮爾茨與現代防禦則面對 e4、d4；反色成白方後還多一個先手，所以可借用配置與突破判斷，不能逐手複製攻擊時間。",
    examples: {
      black: { openingId: "b-kings-indian-defense", label: "王翼印度配置", line: "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O" },
      white: { openingId: "w-kings-indian-attack-with-e6", label: "反色王翼印度配置", line: "1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 5. d3 O-O 6. Nbd2 c5 7. e4" },
    },
  },
  {
    id: "grunfeld-catalan-long-diagonal",
    title: "格林菲爾德家族 ↔ 加泰隆尼亞開局",
    relation: "plan",
    summary: "格林菲爾德／新格林菲爾德與加泰隆都先完成王翼象翼，再用 Bg7／Bg2 長斜線持續壓迫中央與后翼，並配合 c、d 兵張力打開線路。",
    blackIds: ["b-grunfeld-defense", "b-neo-grunfeld-defense"],
    whiteIds: ["w-catalan-opening", "w-catalan-opening-open-defense"],
    sharedIdeas: ["王翼象翼後沿長斜線施壓后翼", "以 …d5、…c5 或 d4、c4 建立中央張力", "中心交換後讓象、后與車共同攻擊開放線上的固定目標"],
    difference: "格林菲爾德由黑方用 …d5、…c5 攻擊白方 e4、d4 大中心，常以 …Nxc3 先拆除守子；加泰隆則由白方用 d4、c4 佔據中心，必要時暫時讓出 c4 兵換取長斜線與先手。兩邊可共用施壓方法，材料判斷與突破方向不能互換。",
    examples: {
      black: { openingId: "b-grunfeld-defense", label: "格林菲爾德拆中心", line: "1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7" },
      white: { openingId: "w-catalan-opening-open-defense", label: "開放加泰隆長象壓力", line: "1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2 dxc4 5. Nf3 Be7 6. O-O O-O" },
    },
  },
  {
    id: "dutch-bird-reversed",
    title: "荷蘭防禦 ↔ 伯德開局",
    relation: "reversed",
    summary: "1.f4 是荷蘭防禦的反色思路：提早用 f 兵控制 e5，並把棋局導向王翼空間與攻勢。",
    blackIds: ["b-dutch-defense", "b-dutch-defense-leningrad-variation"],
    whiteIds: ["w-bird-opening"],
    sharedIdeas: ["f 兵控制關鍵中心格", "Nf3、g3、Bg2 的列寧格勒式配置", "王翼攻擊與 e 兵突破"],
    difference: "f 兵提前移動會削弱王翼與 e3／e6 格；白方的額外先手不會自動消除這項風險。",
    examples: {
      black: { openingId: "b-dutch-defense-leningrad-variation", label: "列寧格勒荷蘭配置", line: "1. d4 f5 2. g3 Nf6 3. Bg2 g6 4. Nf3 Bg7 5. O-O O-O" },
      white: { openingId: "w-bird-opening", label: "伯德象翼配置", line: "1. f4 d5 2. Nf3 Nf6 3. g3 g6 4. Bg2 Bg7 5. O-O O-O" },
    },
  },
  {
    id: "latvian-kings-gambit-reversed",
    title: "拉脫維亞棄兵 ↔ 王翼棄兵",
    relation: "reversed",
    summary: "拉脫維亞棄兵 1.e4 e5 2.Nf3 f5 是黑方版的反色王翼棄兵：兩邊都提早用 f 兵挑戰 e 兵，換取開放 f 線、快速出子與攻王機會。",
    blackIds: ["b-latvian-gambit"],
    whiteIds: ["w-kings-gambit"],
    sharedIdeas: ["用 f 兵立即挑戰對手 e 兵", "打開 f 線並快速集中子力攻王", "接受王翼兵形與對角線被削弱的代價"],
    difference: "拉脫維亞由黑方使用，少一個先手，而且白馬已在 Nf3 發展並直接攻擊 e5；黑方的 …f5 因此比白方 2.f4 更容易遭到立即戰術反擊。可借用主動權與開線觀念，不能把王翼棄兵棋路逐手反色。",
    examples: {
      black: { openingId: "b-latvian-gambit", label: "拉脫維亞尖銳反擊", line: "1. e4 e5 2. Nf3 f5 3. Nxe5 Qf6 4. d4 d6 5. Nc4 fxe4" },
      white: { openingId: "w-kings-gambit", label: "王翼棄兵開線出子", line: "1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4 g4 5. Ne5 Nf6" },
    },
  },
  {
    id: "queenside-fianchetto-reversed",
    title: "歐文／英國式防禦 ↔ 尼姆佐－拉森攻擊",
    relation: "structure",
    summary: "黑方以 …b6、…Bb7 從后翼象翼壓迫中心；白方的 b3、Bb2 用同一條長斜線思想建立彈性布局。",
    blackIds: ["b-owen-defense", "b-english-defense", "b-queens-indian-defense"],
    whiteIds: ["w-nimzo-larsen-attack", "w-basque-opening"],
    sharedIdeas: ["后翼象翼控制長斜線", "延後決定中央兵形", "以 c 兵或 e 兵攻擊對手中心"],
    difference: "這是發展配置與長斜線計畫相似，不是相同兵形；中心兵放在 e4／d4 後，象的目標與突破方向會不同。",
    examples: {
      black: { openingId: "b-owen-defense", label: "黑方后翼象翼", line: "1. e4 b6 2. d4 Bb7 3. Bd3 e6 4. Nf3 Nf6" },
      white: { openingId: "w-nimzo-larsen-attack", label: "白方后翼象翼", line: "1. b3 e5 2. Bb2 Nc6 3. e3 Nf6 4. Nf3" },
    },
  },
  {
    id: "caro-slav-london-structure",
    title: "Caro–Slav 家族 ↔ 倫敦體系",
    relation: "structure",
    summary: "Caro-Kann、斯拉夫與倫敦都常在 e 兵前進前先把后象發展到 f5／f4，避免象被關在兵鏈後方，再以 c 兵或 e 兵挑戰中心。",
    blackIds: ["b-caro-kann-defense", "b-slav-defense"],
    whiteIds: ["w-london-system"],
    sharedIdeas: ["先建立穩固中央支點", "在兵鏈封閉前安排后象到 f5／f4", "完成發展後準備 c 兵或 e 兵的中心突破"],
    difference: "Caro-Kann 面對 e4 中心、斯拉夫面對 d4 與 c4；倫敦則由白方主動搭建 d4、Bf4、e3 配置。相似的是出象次序與穩固中心，實際攻擊目標和突破方向不同。",
    examples: {
      black: { openingId: "b-slav-defense", label: "斯拉夫先出后象", line: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. e3 Bf5" },
      white: { openingId: "w-london-system", label: "倫敦先出后象", line: "1. d4 d5 2. Nf3 Nf6 3. Bf4 e6 4. e3 c5 5. c3" },
    },
  },
  {
    id: "semi-slav-colle-reversed",
    title: "半斯拉夫防禦 ↔ 科勒體系",
    relation: "reversed",
    summary: "半斯拉夫的 c6–d5–e6 兵三角，反色後對應科勒的 c3–d4–e3；兩邊都先穩固中心與完成王翼發展，再準備 …e5 或 e4 解放被兵鏈限制的后象。",
    blackIds: ["b-semi-slav-defense", "b-semi-slav-defense-meran-variation"],
    whiteIds: ["w-colle-system"],
    sharedIdeas: ["c、d、e 兵組成互為反色的中央三角", "王象走 d6／d3並短易位", "以 …e5／e4 解放中心與后象"],
    difference: "半斯拉夫黑方必須先處理白方 c4 對 d5 的壓力，常出現 …dxc4、…b5 的梅蘭后翼戰；科勒白方通常以 c3 支撐 d4並集中準備 e4，沒有同樣的 c4 張力。",
    examples: {
      black: { openingId: "b-semi-slav-defense-meran-variation", label: "半斯拉夫兵三角", line: "1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 e6 5. e3 Nbd7 6. Bd3 dxc4 7. Bxc4 b5" },
      white: { openingId: "w-colle-system", label: "科勒反色兵三角", line: "1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. O-O Nc6 6. Nbd2 Bd6 7. c3 O-O 8. e4" },
    },
  },
  {
    id: "tarrasch-panov-iqp-reversed",
    title: "塔拉什防禦 ↔ 帕諾夫攻擊",
    relation: "reversed",
    summary: "塔拉什防禦讓黑方留下 d5 孤立后兵，帕諾夫攻擊則由白方主動承擔 d4 孤立后兵；兵形反色後，兩邊都用開放 c、e 線與子力活動補償長期兵形弱點。",
    blackIds: ["b-tarrasch-defense"],
    whiteIds: ["w-caro-kann-defense-panov-attack"],
    sharedIdeas: ["用 d4–d5／…d5–d4 突破改變局面", "沿開放 c、e 線集中車與后", "馬佔據 e5／e4，象瞄準王翼來製造主動權"],
    difference: "塔拉什黑方少一個先手，必須在白方封鎖 d5 前完成發展或推進 …d4；帕諾夫白方有額外節奏發起進攻，但若交換過多進入殘局，d4 兵會轉成固定弱點。可共用孤立后兵的攻守判斷，不能照搬具體招法。",
    examples: {
      black: { openingId: "b-tarrasch-defense", label: "塔拉什黑方 d5 孤兵", line: "1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5 exd5 5. Nf3 Nc6 6. g3 Nf6 7. Bg2 Be7 8. O-O O-O 9. Bg5 cxd4 10. Nxd4" },
      white: { openingId: "w-caro-kann-defense-panov-attack", label: "帕諾夫白方 d4 孤兵", line: "1. e4 c6 2. d4 d5 3. exd5 cxd5 4. c4 Nc6 5. Nc3 Nf6 6. Nf3 e6 7. cxd5 exd5 8. Bb5 Bd6 9. Bg5 O-O 10. O-O" },
    },
  },
  {
    id: "scandinavian-center-game-queen-tempo",
    title: "斯堪地那維亞防禦 ↔ 中心開局",
    relation: "plan",
    summary: "兩邊都用 d 兵立刻打開中心，以后取回交換後的中央兵，再接受對方用馬攻后、帶節奏發展；核心課題是把清楚的開放局面轉成快速出子，而不是繼續重複走后。",
    blackIds: ["b-scandinavian-defense"],
    whiteIds: ["w-center-game"],
    sharedIdeas: ["早期 d 兵交換直接打開中心", "以后取兵並預先接受馬帶節奏攻后", "后退到安全格後立刻完成輕子發展與王安全"],
    difference: "斯堪地那維亞由黑方少一個先手迎擊 1.e4，…Qxd5後要控制落後發展的風險；中心開局由白方主動 2.d4，雖讓黑方以…Nc6取得節奏，卻可利用先手與開放線準備長易位和攻王。",
    examples: {
      black: { openingId: "b-scandinavian-defense", label: "斯堪地那維亞后取兵", line: "1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6" },
      white: { openingId: "w-center-game", label: "中心開局后取兵", line: "1. e4 e5 2. d4 exd4 3. Qxd4 Nc6 4. Qe3 Nf6 5. Nc3 Bb4" },
    },
  },
  {
    id: "elephant-center-danish-central-gambit",
    title: "大象棄兵 ↔ 中心開局／丹麥棄兵",
    relation: "plan",
    summary: "大象棄兵的 …d5 與中心開局／丹麥棄兵的 d4，都在王兵對稱後立刻用 d 兵打開中心，把中央兵張力轉成發展節奏與攻王開線。",
    blackIds: ["b-elephant-gambit"],
    whiteIds: ["w-center-game", "w-danish-gambit"],
    sharedIdeas: ["王兵對稱後立即用 d 兵挑戰中心", "接受交換後用快速發展與開線補償中央兵", "趁對方尚未易位，讓象與車沿開放線加入攻勢"],
    difference: "中心開局與丹麥棄兵由白方利用先手走 d4，丹麥還能以 c3 再棄兵打開雙象；大象棄兵則在白馬已到 f3 後才走 …d5，黑方少一個先手、攻擊慢一拍，e5 與 d5 同時受壓時更難證明材料補償。",
    examples: {
      black: { openingId: "b-elephant-gambit", label: "大象棄兵驅馬開線", line: "1. e4 e5 2. Nf3 d5 3. exd5 e4 4. Qe2 Nf6" },
      white: { openingId: "w-danish-gambit", label: "丹麥棄兵雙兵開線", line: "1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Nxc3 Nc6 5. Nf3" },
    },
  },
  {
    id: "budapest-blackmar-diemer-gambit-plan",
    title: "布達佩斯棄兵 ↔ 布萊克馬－迪默棄兵",
    relation: "plan",
    summary: "兩邊都先投入中央兵並允許對手吃兵，換取馬帶節奏、快速出子與開放線；布達佩斯由黑方以 …e5 反擊 d4、c4 中心，布萊克馬－迪默（BDG）則由白方用 e4、f3 主動製造攻勢。",
    blackIds: ["b-indian-defense-budapest-gambit"],
    whiteIds: ["w-blackmar-diemer-gambit", "w-blackmar-diemer-gambit-accepted"],
    sharedIdeas: ["用中央兵換取發展速度與主動權", "馬一面攻兵一面帶節奏出子", "迅速開發象、后並把兵線轉成攻擊線"],
    difference: "布達佩斯通常以 …Ng4、…Nc6、…Qe7 集中奪回 e5 兵，未必真的少兵；布萊克馬－迪默接受變例則讓白方實際少一兵，補償是否足夠較具爭議。兩者可共用主動權觀念，不能把戰術或理論評價直接互換。",
    examples: {
      black: { openingId: "b-indian-defense-budapest-gambit", label: "布達佩斯追兵出子", line: "1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7" },
      white: { openingId: "w-blackmar-diemer-gambit-accepted", label: "BDG 開線換發展", line: "1. d4 d5 2. e4 dxe4 3. Nc3 Nf6 4. f3 exf3 5. Nxf3 Bf5 6. Bc4 e6 7. O-O" },
    },
  },
  {
    id: "englund-blackmar-diemer-reversed",
    title: "英格蘭棄兵 ↔ 布萊克馬－迪默棄兵",
    relation: "reversed",
    summary: "英格蘭棄兵的 1.d4 e5 與布萊克馬－迪默棄兵的 1.d4 d5 2.e4，都是用 e 兵立即挑戰對方 d 兵、以中央兵換取發展速度與主動權的近似反色構想。",
    blackIds: ["b-englund-gambit"],
    whiteIds: ["w-blackmar-diemer-gambit", "w-blackmar-diemer-gambit-accepted"],
    sharedIdeas: ["用 e 兵立即挑戰對手的 d 兵中心", "犧牲中央兵換取快速出子與主動權", "在對手易位前利用開放線與帶節奏招法"],
    difference: "英格蘭棄兵由黑方使用，少一個先手，常要用 …Qe7、…Qb4+ 等后棋追兵，后若暴露反而會落後發展；BDG 白方則可用 f3 再棄兵並打開 f 線。兩邊都需要具體計算，不能把陷阱或補償逐手鏡像。",
    examples: {
      black: { openingId: "b-englund-gambit", label: "英格蘭棄兵追兵棋路", line: "1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Nc3 Nb4" },
      white: { openingId: "w-blackmar-diemer-gambit-accepted", label: "BDG f 線開放棋路", line: "1. d4 d5 2. e4 dxe4 3. Nc3 Nf6 4. f3 exf3 5. Nxf3" },
    },
  },
  {
    id: "benko-polish-queenside-plan",
    title: "班科棄兵 ↔ 波蘭開局",
    relation: "plan",
    summary: "兩邊都提早推 b 兵取得后翼空間，並以 …Bg7／Bb2 從 a1–h8 長斜線施壓中心與后翼；共同課題是把側翼兵的前進轉成子力活動，而不是只顧著多推兵。",
    blackIds: ["b-benko-gambit", "b-benko-gambit-accepted"],
    whiteIds: ["w-polish-opening", "w-polish-opening-with-d5"],
    sharedIdeas: ["提早推 b 兵逼對手決定后翼兵形", "用 …Bg7／Bb2 控制 a1–h8 長斜線", "后翼線路打開後讓車與后加入壓力"],
    difference: "班科用 …b5、…a6 主動犧牲兵，換取半開 a、b 線與長期補償；波蘭的 b4 主要是保留空間並開放 Bb2，b 兵本身反而可能成為攻擊目標。兩者的兵值判斷與開線時機不能直接互換。",
    examples: {
      black: { openingId: "b-benko-gambit", label: "班科開線與象翼", line: "1. d4 Nf6 2. c4 c5 3. d5 b5 4. cxb5 a6 5. bxa6 g6 6. Nc3 Bxa6 7. g3 d6 8. Bg2 Bg7 9. Nf3 O-O" },
      white: { openingId: "w-polish-opening", label: "波蘭 b 兵與長象", line: "1. b4 e6 2. Bb2 Nf6 3. b5 d5 4. e3" },
    },
  },
  {
    id: "polish-defense-opening-reversed",
    title: "波蘭防禦 ↔ 波蘭開局",
    relation: "reversed",
    summary: "波蘭防禦的 1…b5 是波蘭開局 1.b4 的黑方類比：兩邊都先用 b 兵取得后翼空間，再以 …Bb7／Bb2 沿長斜線影響中心。",
    blackIds: ["b-polish-defense"],
    whiteIds: ["w-polish-opening", "w-polish-opening-with-d5"],
    sharedIdeas: ["提早推 b 兵取得后翼空間", "以 …Bb7／Bb2 控制長斜線", "用 a 兵或 c 兵支援、打開后翼線路"],
    difference: "波蘭防禦由黑方使用，少一個先手且白方已用 d4 佔領中心；1…b5 也可能立刻受到 e4 與 Bxb5 的戰術壓力。白方波蘭開局雖多一拍，b4 兵仍可能被 …a5 或 …c5 攻擊，因此只能借用布局觀念，不能逐手鏡像。",
    examples: {
      black: { openingId: "b-polish-defense", label: "波蘭防禦長象配置", line: "1. d4 b5 2. Nf3 Bb7 3. e3 a6 4. Bd3 Nf6" },
      white: { openingId: "w-polish-opening-with-d5", label: "波蘭開局反色配置", line: "1. b4 d5 2. Bb2 Nf6 3. e3 e6 4. Nf3 Be7" },
    },
  },
  {
    id: "nimzo-trompowsky-pin",
    title: "尼姆佐印度防禦 ↔ 特龍普夫斯基／托雷攻擊",
    relation: "plan",
    summary: "兩邊都用象提早釘住保護中心的馬，迫使對手決定是否接受雙兵、失去象對或花時間解除釘住。",
    blackIds: ["b-nimzo-indian-defense", "b-nimzo-indian-defense-rubinstein-system"],
    whiteIds: ["w-trompowsky-attack", "w-torre-attack", "w-richter-veresov-attack"],
    sharedIdeas: ["象釘馬後施壓中心", "以象對交換結構弱點", "根據對手驅象方式改變中心計畫"],
    difference: "尼姆佐印度的 Bb4 釘住 Nc3 與白王，特龍普夫斯基／托雷的 Bg5 針對 Nf6；戰術目標相似，但攻擊的中心格不同。",
    examples: {
      black: { openingId: "b-nimzo-indian-defense", label: "黑象釘住后翼馬", line: "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O" },
      white: { openingId: "w-trompowsky-attack", label: "白象釘住王翼馬", line: "1. d4 Nf6 2. Bg5 e6 3. Nd2 d5 4. e3" },
    },
  },
  {
    id: "benoni-reti-reversed",
    title: "別諾尼防禦 ↔ 列蒂開局",
    relation: "reversed",
    summary: "列蒂的 1.Nf3 d5 2.c4 先用 c 兵側攻黑方 d 兵；若黑方以 …d4 推進保留空間，就會呈現反色別諾尼式的中心兵鏈與側翼反擊。",
    blackIds: ["b-benoni-defense", "b-benoni-defense-modern"],
    whiteIds: ["w-reti-opening"],
    sharedIdeas: ["c 兵從側翼挑戰 d 兵中心", "王翼象翼施壓長斜線", "不急著佔滿中心，先逼對手暴露兵鏈目標"],
    difference: "別諾尼由黑方少一個先手承擔空間壓力，常需 …e6、…b5 或 …f5 擊破白方中心；列蒂白方多一個先手，且仍可依黑方回應轉入英格蘭或后翼棄兵。",
    examples: {
      black: { openingId: "b-benoni-defense-modern", label: "現代別諾尼兵鏈", line: "1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6" },
      white: { openingId: "w-reti-opening", label: "列蒂反色別諾尼", line: "1. Nf3 d5 2. c4 d4 3. b4 Nf6" },
    },
  },
  {
    id: "philidor-kia-reversed",
    title: "菲利多爾防禦 ↔ 王翼印度攻擊",
    relation: "reversed",
    summary: "菲利多爾的 …e5、…d6、…Nf6 兵子核心，反色後對應王翼印度攻擊的 e4、d3、Nf3，兩者都先穩固王兵中心再準備 f 兵突破。",
    blackIds: ["b-philidor-defense"],
    whiteIds: ["w-kings-indian-attack", "w-kings-indian-attack-with-e6"],
    sharedIdeas: ["e、d 兵前後相連的穩固中心", "馬經 d2／d7 轉往進攻格", "以 f4／…f5 打開王翼與 e 線"],
    difference: "王翼印度攻擊通常把王象象翼到 g2，菲利多爾則多以 …Be7 發展；象的斜線不同，所以馬的轉進路徑與 f 兵突破時機不能照搬。",
    examples: {
      black: { openingId: "b-philidor-defense", label: "菲利多爾穩固中心", line: "1. e4 e5 2. Nf3 d6 3. d4 Nd7 4. Bc4 Be7 5. O-O Ngf6" },
      white: { openingId: "w-kings-indian-attack-with-e6", label: "王翼印度攻擊中心", line: "1. Nf3 d5 2. g3 Nf6 3. Bg2 e6 4. O-O Be7 5. d3 O-O 6. Nbd2 c5 7. e4" },
    },
  },
  {
    id: "qgd-colle-structure",
    title: "后翼棄兵拒絕 ↔ 科勒體系",
    relation: "structure",
    summary: "后翼棄兵拒絕以 …d5、…e6 支撐中心，科勒則用 d4、e3 搭建對應的白方兵鏈；共通課題是先完成出子，再以解放性兵突破活化壞象。",
    blackIds: ["b-queens-gambit-declined", "b-queens-gambit-declined-orthodox-defense"],
    whiteIds: ["w-colle-system"],
    sharedIdeas: ["d、e 兵鏈帶來穩固中心", "馬放 f6／f3，王象經 e7／d3 發展", "準備 …c5／…e5 或 e4 解放兵鏈後方的象"],
    difference: "后翼棄兵局面中白兵已在 c4 施壓 d5，黑方要先解決中心張力；科勒通常保留 c2 兵並集中準備 e4，兩邊的主要突破線並不相同。",
    examples: {
      black: { openingId: "b-queens-gambit-declined", label: "后翼棄兵拒絕兵鏈", line: "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Nf3 Be7 5. Bg5 O-O 6. e3" },
      white: { openingId: "w-colle-system", label: "科勒 d4–e3 兵鏈", line: "1. d4 d5 2. Nf3 Nf6 3. e3 e6 4. Bd3 c5 5. O-O Nc6 6. Nbd2" },
    },
  },
];

export function buildAnalogyGroups(catalog) {
  const openingById = new Map(catalog.openings.map((opening) => [opening.id, opening]));
  return curatedAnalogies.map((group) => {
    const missingIds = [...group.blackIds, ...group.whiteIds].filter((id) => !openingById.has(id));
    if (missingIds.length) throw new Error(`${group.id}: missing analogy members ${missingIds.join(", ")}`);
    if (group.blackIds.some((id) => openingById.get(id).side !== "黑方")) throw new Error(`${group.id}: black member has wrong side`);
    if (group.whiteIds.some((id) => openingById.get(id).side !== "白方")) throw new Error(`${group.id}: white member has wrong side`);
    for (const [side, example, memberIds] of [["black", group.examples.black, group.blackIds], ["white", group.examples.white, group.whiteIds]]) {
      if (!memberIds.includes(example.openingId)) throw new Error(`${group.id}: ${side} example is not a group member`);
      const game = new Chess();
      for (const move of sanMoves(example.line)) {
        try { game.move(move); } catch { throw new Error(`${group.id}: illegal ${side} example move ${move}`); }
      }
    }
    return group;
  });
}

export function buildMapData(catalog, variationCatalog = { variations: [] }, catalogRevision = buildCatalogRevision(catalog, variationCatalog)) {
  const items = catalog.openings;
  const nodes = items.map((item) => ({
    ...(() => {
      const moves = sanMoves(item.mainline);
      const firstMoveSan = moves[0] ?? "";
      const firstMove = firstMoveGroup(firstMoveSan);
      const family = familyGroup(item);
      const replySan = moves[1] ?? "起手";
      const subgroup = subgroupFor(firstMove, firstMoveSan, replySan);
      return {
        first_move: firstMove,
        first_move_san: firstMoveSan,
        reply_san: replySan,
        subgroup,
        family,
      };
    })(),
    id: item.id,
    title_zh: normalizedChineseTitle(item),
    title_en: item.title_en,
    side: item.side,
    category: item.category,
    eco: item.eco,
    styles: item.styles,
    mainline: item.mainline.replace(/\s+/g, " ").trim(),
    variations: item.variations.map((variation) => ({ name: variation.name, line: variation.line.replace(/\s+/g, " ").trim() })),
  }));
  const familyBuckets = new Map();
  for (const node of nodes) {
    const key = `${node.side}:${node.family.id}`;
    const bucket = familyBuckets.get(key) ?? [];
    bucket.push(node);
    familyBuckets.set(key, bucket);
  }
  const styleNames = ["局面", "戰術", "主動", "穩健", "發展"];
  return {
    schema_version: schemaVersion,
    catalog_revision: catalogRevision,
    nodes,
    navigation: {
      sides: ["白方", "黑方"].map((id) => ({ id, count: nodes.filter((node) => node.side === id).length })),
      first_moves: ["白方", "黑方"].flatMap((side) => [...new Set(nodes.filter((node) => node.side === side).map((node) => node.first_move))].map((value) => ({ side, value, count: nodes.filter((node) => node.side === side && node.first_move === value).length }))),
      families: [...familyBuckets.values()].map((members) => {
        const ordered = [...members].sort((a, b) => a.eco.localeCompare(b.eco) || a.title_zh.localeCompare(b.title_zh, "zh-Hant"));
        return {
          id: members[0].family.id,
          label: members[0].family.label,
          side: members[0].side,
          first_move: members[0].first_move,
          first_move_san: members[0].first_move_san,
          reply_san: members[0].reply_san,
          subgroup: members[0].subgroup,
          count: members.length,
          eco_min: ordered[0].eco,
          eco_max: ordered.at(-1).eco,
          representative_ids: ordered.slice(0, 3).map((node) => node.id),
        };
      }).sort((a, b) => a.side.localeCompare(b.side, "zh-Hant") || a.first_move.localeCompare(b.first_move) || a.eco_min.localeCompare(b.eco_min)),
      styles: styleNames.map((value) => ({ value, count: nodes.filter((node) => node.styles.includes(value)).length })),
    },
  };
}

export function buildOpeningDetails(catalog, catalogRevision = buildCatalogRevision(catalog)) {
  return {
    schema_version: schemaVersion,
    catalog_revision: catalogRevision,
    edges: {
      family: strongestEdges(catalog.openings, familyScore),
      style: strongestEdges(catalog.openings, styleScore),
    },
    openings: Object.fromEntries(catalog.openings.map((item) => [item.id, {
      difficulty: item.difficulty,
      ideas: item.ideas,
      plans: item.plans,
      mistakes: item.mistakes,
    }])),
  };
}

const boilerplateVariationNote = /比較中心張力、王安全與最差子力|找出此線專屬的突破時機/;
const pieceNames = { p: "兵", n: "馬", b: "象", r: "車", q: "后", k: "王" };

function plyLabel(index, san) {
  const moveNumber = Math.floor(index / 2) + 1;
  return index % 2 === 0 ? `${moveNumber}.${san}` : `${moveNumber}…${san}`;
}

function knightTargets(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
    .map(([fileOffset, rankOffset]) => [file + fileOffset, rank + rankOffset])
    .filter(([targetFile, targetRank]) => targetFile >= 0 && targetFile < 8 && targetRank >= 0 && targetRank < 8)
    .map(([targetFile, targetRank]) => `${String.fromCharCode(97 + targetFile)}${targetRank + 1}`);
}

function describeSanMove(chess, san) {
  const move = chess.move(san);
  const side = move.color === "w" ? "白方" : "黑方";
  const homeRank = move.color === "w" ? "1" : "8";
  if (/^O-O-O/.test(san)) return `${side}完成后翼易位，讓王離開中央並把 a${homeRank}車帶到 d${homeRank}`;
  if (/^O-O/.test(san)) return `${side}完成王翼易位，安置王並把 h${homeRank}車帶到 f${homeRank}`;

  const piece = pieceNames[move.piece] ?? "棋子";
  let description = move.piece === "p" && move.captured
    ? `${side}以 ${move.from}兵吃到 ${move.to}`
    : move.piece === "p"
    ? `${side}把 ${move.from}兵推到 ${move.to}`
    : `${side}把${piece}從 ${move.from}移到 ${move.to}`;
  if (move.captured && move.piece !== "p") description += `，並吃掉 ${move.to}上的${pieceNames[move.captured] ?? "棋子"}`;
  if (move.promotion) description += `，升變成${pieceNames[move.promotion] ?? move.promotion}`;
  if (move.piece === "n") description += `，馬由此控制 ${knightTargets(move.to).join("、")}`;
  else if (move.piece === "b") description += "，讓象進入新的斜線";
  else if (move.piece === "r") description += `，把車放到 ${move.to[0]} 線`;
  else if (move.piece === "q") description += "，后提早參與局面並向多個方向施壓";
  else if (move.piece === "p" && /[de]/.test(move.to[0])) description += "，直接改變中心控制";
  else if (move.piece === "p" && /[cf]/.test(move.to[0])) description += "，從側面挑戰中心並準備開線";
  else if (move.piece === "p") description += "，爭取側翼空間";
  if (san.endsWith("#")) description += "，同時形成將死";
  else if (san.endsWith("+")) description += "，同時將軍";
  return description;
}

function concreteVariationNote(opening, variation, variationIndex) {
  if (!boilerplateVariationNote.test(variation.note)) return variation.note;
  const mainMoves = sanMoves(opening.mainline);
  const variationMoves = sanMoves(variation.line);
  let shared = 0;
  while (shared < mainMoves.length && shared < variationMoves.length && mainMoves[shared] === variationMoves[shared]) shared += 1;
  let distinguishingFocus = null;
  for (let candidate = 0; candidate < variationMoves.length; candidate += 1) {
    const sharesPrefix = opening.variations.some((sibling, siblingIndex) => {
      if (siblingIndex === variationIndex) return false;
      const siblingMoves = sanMoves(sibling.line);
      return siblingMoves.length > candidate
        && variationMoves.slice(0, candidate + 1).every((move, index) => siblingMoves[index] === move);
    });
    if (!sharesPrefix) {
      distinguishingFocus = candidate;
      break;
    }
  }
  const focus = distinguishingFocus ?? (shared < variationMoves.length ? shared : Math.max(0, variationMoves.length - 1));
  const chess = new Chess();
  for (let index = 0; index < focus; index += 1) chess.move(variationMoves[index]);
  const focusMove = variationMoves[focus];
  const focusExplanation = describeSanMove(chess, focusMove);

  let relationship;
  if (distinguishingFocus !== null && opening.variations.length > 1) relationship = "在同組變例中確立自己的分支";
  else if (shared < mainMoves.length && shared < variationMoves.length) relationship = "與官方辨識線分歧";
  else if (shared === mainMoves.length && variationMoves.length > mainMoves.length) relationship = "從官方辨識局面繼續延伸";
  else if (variationMoves.length < mainMoves.length) relationship = "標示官方辨識線中的較早節點";
  else relationship = "與官方辨識棋路抵達同一節點";

  let note = `「${variation.name}」以 ${plyLabel(focus, focusMove)} ${relationship}：${focusExplanation}。`;
  if (variationMoves[focus + 1]) {
    const reply = variationMoves[focus + 1];
    note += ` 接著 ${plyLabel(focus + 1, reply)}：${describeSanMove(chess, reply)}。`;
  }
  if (variationMoves.length > focus + 2) {
    const lastIndex = variationMoves.length - 1;
    note += ` 來源棋路其後收錄至 ${plyLabel(lastIndex, variationMoves[lastIndex])}，可在上方棋盤逐步播放完整次序。`;
  }
  return note;
}

export function buildVariationNotes(catalog, catalogRevision = buildCatalogRevision(catalog)) {
  return {
    schema_version: schemaVersion,
    catalog_revision: catalogRevision,
    notes: catalog.openings.map((item) => item.variations.map((variation, variationIndex) => concreteVariationNote(item, variation, variationIndex))),
  };
}

export function buildExplorerData(catalog, variationCatalog = { variations: [] }, catalogRevision = buildCatalogRevision(catalog, variationCatalog)) {
  return {
    schema_version: schemaVersion,
    catalog_revision: catalogRevision,
    transpositionGroups: buildTranspositionGroups(catalog, variationCatalog),
    analogyGroups: buildAnalogyGroups(catalog),
  };
}

function normalizedChineseTitle(item) {
  if (!/Sicilian Defense/i.test(item.title_en) || item.title_zh.startsWith("西西里防禦")) return item.title_zh;
  if (item.title_zh === "封閉式西西里") return "西西里防禦：封閉變例";
  if (item.title_zh === "開放式西西里") return "西西里防禦：開放變例";
  if (item.title_zh.startsWith("西西里：")) return item.title_zh.replace(/^西西里：/, "西西里防禦：");
  return `西西里防禦：${item.title_zh}`;
}

async function main() {
  const catalog = JSON.parse(await readFile(source, "utf8"));
  const variationCatalog = JSON.parse(await readFile(variationsSource, "utf8"));
  const catalogRevision = buildCatalogRevision(catalog, variationCatalog);
  const data = buildMapData(catalog, variationCatalog, catalogRevision);
  const details = buildOpeningDetails(catalog, catalogRevision);
  const explorers = buildExplorerData(catalog, variationCatalog, catalogRevision);
  const variationNotes = buildVariationNotes(catalog, catalogRevision);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(data)}\n`, "utf8");
  await writeFile(detailsDestination, `${JSON.stringify(details)}\n`, "utf8");
  await writeFile(explorersDestination, `${JSON.stringify(explorers)}\n`, "utf8");
  await writeFile(variationNotesDestination, `${JSON.stringify(variationNotes)}\n`, "utf8");
  console.log(`Generated ${data.nodes.length} opening nodes and lazy catalogs in ${dirname(destination)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
