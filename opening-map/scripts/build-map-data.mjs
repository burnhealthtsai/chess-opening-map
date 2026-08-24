import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Chess } from "chess.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "..", "openings.yaml");
const variationsSource = resolve(root, "..", "variations.json");
const destination = resolve(root, "public", "opening-map.json");

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

function styleGroup(item) {
  const priority = ["戰術", "局面", "主動", "穩健", "發展"];
  const style = priority.find((name) => item.styles.includes(name)) ?? item.styles[0] ?? "其他";
  return { id: style, label: `${style}取向` };
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

export function buildMapData(catalog, variationCatalog = { variations: [] }) {
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
        catalog_first_move: item.first_move,
        classification_path: [item.side, firstMove, subgroup.id, family.id, item.id],
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
    difficulty: item.difficulty,
    mainline: item.mainline.replace(/\s+/g, " ").trim(),
    variations: item.variations.map((variation) => ({ ...variation, line: variation.line.replace(/\s+/g, " ").trim() })),
    ideas: item.ideas,
    plans: item.plans,
    mistakes: item.mistakes,
    style: styleGroup(item),
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
    schema_version: 4,
    generated_at: new Date().toISOString(),
    nodes,
    edges: {
      family: strongestEdges(items, familyScore),
      style: strongestEdges(items, styleScore),
    },
    transpositionGroups: buildTranspositionGroups(catalog, variationCatalog),
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
  const data = buildMapData(catalog, variationCatalog);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(data)}\n`, "utf8");
  console.log(`Generated ${data.nodes.length} opening nodes at ${destination}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
