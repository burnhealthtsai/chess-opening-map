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

function buildAutomaticTranspositions(openingIds, variations) {
  const positions = new Map();
  for (const variation of variations) {
    if (!openingIds.has(variation.opening_id)) continue;
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
    .map((candidate, index) => ({
      id: `official-transposition-${index + 1}`,
      title: "官方棋路合流群",
      summary: "不同官方開局棋路抵達完全相同的局面；可比較走子順序如何隱藏或延後開局選擇。",
      relation: "exact",
      targetFen: candidate.targetFen,
      memberIds: candidate.memberIds,
      routes: candidate.routes.map(({ depth: _depth, ...route }) => route),
      source: "lichess-epd",
    }));
}

export function buildTranspositionGroups(catalog, variationCatalog = { variations: [] }) {
  const openingIds = new Set(catalog.openings.map((opening) => opening.id));
  return [
    ...buildCuratedTranspositions(openingIds),
    ...buildAutomaticTranspositions(openingIds, variationCatalog.variations ?? []),
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
  },
  {
    id: "kings-indian-defense-attack",
    title: "王翼印度防禦 ↔ 王翼印度攻擊",
    relation: "reversed",
    summary: "王翼印度攻擊把黑方王翼印度的 Nf6、g6、Bg7、d6、e5 配置換成白方的 Nf3、g3、Bg2、d3、e4。",
    blackIds: ["b-kings-indian-defense", "b-kings-indian-defense-orthodox-variation"],
    whiteIds: ["w-kings-indian-attack", "w-kings-indian-attack-with-e6"],
    sharedIdeas: ["王翼象翼與安全易位", "先讓對手建立中心再反擊", "以 e、f 兵推進製造王翼攻勢"],
    difference: "同一套子力配置換色後，攻擊速度與中心責任會改變；白方多一手，通常先穩定完成 e4、d3 再準備 e5。",
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
  },
  {
    id: "caro-slav-london-colle",
    title: "Caro–Slav 家族 ↔ 倫敦／科勒體系",
    relation: "structure",
    summary: "Caro-Kann、斯拉夫與倫敦／科勒都偏好可靠兵鏈、自然出子，再選擇 …c5／c4 或 …e5／e4 的中心突破。",
    blackIds: ["b-caro-kann-defense", "b-slav-defense", "b-semi-slav-defense"],
    whiteIds: ["w-london-system", "w-colle-system", "w-reti-opening-anglo-slav-variation"],
    sharedIdeas: ["先建立穩固中央支點", "避免壞象被鎖在兵鏈內", "完成發展後才進行中心突破"],
    difference: "這一組比較的是兵鏈管理與出子次序；Caro-Kann 面對 e4、Slav 面對 d4，而倫敦／科勒由白方主動搭建體系。",
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
  },
];

export function buildAnalogyGroups(catalog) {
  const openingById = new Map(catalog.openings.map((opening) => [opening.id, opening]));
  return curatedAnalogies.map((group) => {
    const missingIds = [...group.blackIds, ...group.whiteIds].filter((id) => !openingById.has(id));
    if (missingIds.length) throw new Error(`${group.id}: missing analogy members ${missingIds.join(", ")}`);
    if (group.blackIds.some((id) => openingById.get(id).side !== "黑方")) throw new Error(`${group.id}: black member has wrong side`);
    if (group.whiteIds.some((id) => openingById.get(id).side !== "白方")) throw new Error(`${group.id}: white member has wrong side`);
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

export function buildVariationNotes(catalog, catalogRevision = buildCatalogRevision(catalog)) {
  return {
    schema_version: schemaVersion,
    catalog_revision: catalogRevision,
    notes: catalog.openings.map((item) => item.variations.map((variation) => variation.note)),
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
