import type { DetailedOpening } from "./types";

export type FamousGame = {
  event: string;
  site: string;
  year: number;
  white: string;
  black: string;
  result: string;
  line: string;
  families: string[];
};

const originNotes: { keys: string[]; note: string }[] = [
  { keys: ["French Defense", "法蘭西防禦"], note: "名稱來自 1834 年倫敦對巴黎的通信棋賽；巴黎隊採用這套 1.e4 e6 防禦後，它逐漸被稱為法蘭西防禦。" },
  { keys: ["Sicilian Defense", "西西里防禦"], note: "名稱指向義大利西西里島。早期義大利棋手記錄並推廣 1...c5，後來棋譜便沿用「西西里防禦」。" },
  { keys: ["Ruy Lopez", "西班牙開局"], note: "以 16 世紀西班牙神父兼棋手 Ruy López de Segura 命名；中文也常按其國籍稱為西班牙開局。" },
  { keys: ["Caro-Kann", "卡羅康防禦"], note: "以 Horatio Caro 與 Marcus Kann 兩位分析者的姓氏命名；記成「Caro＋Kann＝c6、d5 的堅固中心」。" },
  { keys: ["Alekhine", "阿廖欣"], note: "以世界冠軍 Alexander Alekhine 命名；黑方先用馬挑釁白兵前進，再攻擊被拉長的兵鏈。" },
  { keys: ["Pirc", "皮爾茨"], note: "以斯洛維尼亞／南斯拉夫棋手 Vasja Pirc 命名，是先讓白方佔中心、再從側翼反擊的超現代防禦。" },
  { keys: ["English Opening", "英格蘭開局", "英式開局"], note: "名稱與英國名將 Howard Staunton 的推廣有關；用 1.c4 從側面控制 d5，像是以側翼包圍中心。" },
  { keys: ["Scotch Game", "蘇格蘭開局"], note: "名稱源自 1824 年愛丁堡與倫敦之間的通信棋賽，愛丁堡一方使用了這套快速 d4 破中心的走法。" },
  { keys: ["Italian Game", "義大利開局"], note: "這套 Bc4 瞄準 f7 的古典走法由義大利棋手長期研究，因此得名義大利開局。" },
  { keys: ["Vienna Game", "維也納開局"], note: "由 19 世紀維也納棋派深入研究；先走 Nc3，保留 f4 進攻與多種中心配置。" },
  { keys: ["Old Indian", "古印度"], note: "古印度防禦由 1.d4 Nf6 2.c4 d6 形成，黑方通常以…Nbd7、…e5 建立中心，並把王翼象自然發展到 e7；這正是它與把象翼展到 g7 的王翼印度防禦最醒目的差別。這套下法也稱為 Chigorin Indian，因 Mikhail Chigorin 在晚年率先實戰研究。" },
  { keys: ["Bogo-Indian", "博戈印度"], note: "以 Efim Bogoljubow 命名；黑方用…Bb4+ 先將軍，再依白方應對決定交換或退象。" },
  { keys: ["East Indian", "東印度"], note: "這是棋譜對 1.d4 Nf6 2.Nf3 g6 配置沿用的家族名稱；它描述的是可轉入王翼印度、格林菲爾德或其他王翼象翼展體系的入口，不代表單一固定變例。" },
  { keys: ["Slav Indian", "斯拉夫印度"], note: "名稱把印度防禦的…Nf6 與斯拉夫式…c6 結合在一起；它是配置描述，不是把國家圖案直接套到棋子或棋盤。" },
  { keys: ["Budapest Gambit", "布達佩斯棄兵"], note: "名稱來自匈牙利布達佩斯棋手在 20 世紀初的分析與實戰；黑方以 1.d4 Nf6 2.c4 e5 立即挑戰白方中心。" },
  { keys: ["King's Indian", "王翼印度"], note: "「王翼」表示黑方在王翼配置馬與象；「印度」是棋譜沿用的超現代開局名稱，重點是先控制、後反擊中心。" },
  { keys: ["Queen's Indian", "后翼印度"], note: "「后翼」表示黑方以 b6、Bb7 在后翼長斜線施壓；它與王翼印度同屬先控制、後反擊中心的體系。" },
  { keys: ["Nimzo-Indian", "尼姆佐印度"], note: "以超現代派大師 Aron Nimzowitsch 命名；Bb4 釘住 Nc3，間接控制中心而不急著用兵佔領。" },
  { keys: ["Grünfeld", "格林菲爾德"], note: "以奧地利大師 Ernst Grünfeld 命名；黑方容許白方建立大中心，再用 Bg7 與 c5 反擊。" },
  { keys: ["Réti", "列蒂"], note: "以超現代派大師 Richard Réti 命名；1.Nf3 暫不亮出中心兵，保留轉入多種開局的彈性。" },
  { keys: ["Bird", "伯德"], note: "以英國棋手 Henry Bird 命名；1.f4 直接控制 e5，也常被視為先手版荷蘭防禦。" },
  { keys: ["Catalan", "加泰隆"], note: "名稱與 1929 年巴塞隆納賽事及加泰隆地區有關；特色是 d4、c4 配合王翼象走上 g2 長斜線。" },
  { keys: ["Philidor", "菲利多"], note: "以法國大師 François-André Danican Philidor 命名；他強調兵形的重要性，1...d6 也先穩固 e5。" },
];

export const famousGames: FamousGame[] = [
  { event: "倫敦『不朽之局』", site: "London", year: 1851, white: "Adolf Anderssen", black: "Lionel Kieseritzky", result: "1–0", families: ["King's Gambit", "王翼棄兵"], line: "e4 e5 f4 exf4 Bc4 Qh4+ Kf1 b5 Bxb5 Nf6 Nf3 Qh6 d3 Nh5 Nh4 Qg5" },
  { event: "巴黎歌劇院對局", site: "Paris", year: 1858, white: "Paul Morphy", black: "Duke Karl / Count Isouard", result: "1–0", families: ["Philidor", "菲利多"], line: "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6" },
  { event: "Hastings 1895", site: "Hastings", year: 1895, white: "Wilhelm Steinitz", black: "Curt von Bardeleben", result: "1–0", families: ["Italian Game", "義大利開局"], line: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 e5 d5 Bb5 Ne4 cxd4 Bb4+ Bd2 Nxd2" },
  { event: "New York 1918", site: "New York", year: 1918, white: "José Raúl Capablanca", black: "Frank Marshall", result: "1–0", families: ["Ruy Lopez", "西班牙開局", "Marshall"], line: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5" },
  { event: "世界冠軍賽第 6 局", site: "Reykjavik", year: 1972, white: "Bobby Fischer", black: "Boris Spassky", result: "1–0", families: ["Queen's Gambit", "后翼棄兵"], line: "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5 O-O e3 h6 Bh4 b6 cxd5 Nxd5" },
  { event: "『世紀之局』", site: "New York", year: 1956, white: "Donald Byrne", black: "Bobby Fischer", result: "0–1", families: ["Grünfeld", "格林菲爾德"], line: "Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5 Qb3 dxc4 Qxc4 c6 e4 Nbd7" },
  { event: "世界冠軍賽第 16 局", site: "Moscow", year: 1985, white: "Anatoly Karpov", black: "Garry Kasparov", result: "0–1", families: ["Sicilian Defense", "西西里防禦"], line: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nb5 d6 c4 Nf6 N1c3 a6 Na3 d5" },
  { event: "Wijk aan Zee", site: "Wijk aan Zee", year: 1999, white: "Garry Kasparov", black: "Veselin Topalov", result: "1–0", families: ["Pirc", "皮爾茨"], line: "e4 d6 d4 Nf6 Nc3 g6 Be3 Bg7 Qd2 c6 f3 b5 a3 Nbd7 g4 O-O h4" },
  { event: "人機大戰第 6 局", site: "New York", year: 1997, white: "Deep Blue", black: "Garry Kasparov", result: "1–0", families: ["Caro-Kann", "卡羅康"], line: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Ng5 Ngf6 Bd3 e6 N1f3 h6 Nxe6 Qe7" },
];

export function openingMemory(opening: DetailedOpening) {
  const title = `${opening.title_en} ${opening.title_zh}`;
  const origin = originNotes.find(({ keys }) => keys.some((key) => title.includes(key)))?.note;
  const variation = opening.title_zh.match(/[:：](.+)$/)?.[1]?.trim();
  if (origin) return variation ? `${origin}「${variation}」是此家族下用來區分具體走法的變例名稱。` : origin;
  return `目前沒有足夠可靠的獨立詞源資料，因此不替「${opening.title_zh}」編造人物或地名故事。請把名稱和辨識棋路 ${opening.mainline.split(/\s+/).slice(0, 8).join(" ")} 一起記；實際局面比未經證實的故事更可靠。`;
}

export function gamesForOpening(opening: DetailedOpening) {
  const title = `${opening.title_en} ${opening.title_zh}`;
  return famousGames.filter((game) => game.families.some((family) => title.includes(family))).slice(0, 10);
}

export type PhaseGuide = {
  id: "opening" | "middlegame" | "endgame";
  label: string;
  eyebrow: string;
  icon: string;
  title: string;
  tips: string[];
};

export function phaseGuides(opening: DetailedOpening): PhaseGuide[] {
  const identity = `${opening.title_zh} ${opening.title_en}`;
  const context = `${identity} ${opening.ideas} ${opening.plans.join(" ")} ${opening.styles.join(" ")}`;
  const firstPlans = opening.plans.slice(0, 2);
  const openingTips = firstPlans.length
    ? firstPlans
    : ["先完成輕子發展，再決定中心兵的推進時機。", "王尚未安全前，不要為了搶兵重複移動同一枚棋子。"];

  let middlegameTitle = "中心與子力協調";
  let middlegameTips = ["找出最差的一枚棋子，先把它移到能支援中心或進攻的位置。", "兵突破前先增加攻擊子力，避免只靠一枚棋子動手。"];
  if (/戰術|棄兵|Gambit|Attack|攻擊/.test(context)) {
    middlegameTitle = "保留先手，集中火力";
    middlegameTips = ["每一步都要帶威脅或改善最積極的棋子，避免讓對手免費完成發展。", "優先打開通往王區的線；若攻勢消失，就先收回鬆散棋子。"];
  } else if (/印度|Indian|Catalan|加泰隆|English|英式|局面/.test(context)) {
    middlegameTitle = "側翼施壓，等待中心破口";
    middlegameTips = ["保留長斜線象，先改善中心控制，再決定 c、e 兵突破。", "對手中心前進時攻擊兵鏈底部，不要只追趕最前面的兵。"];
  } else if (/法蘭西|French|卡羅康|Caro-Kann/.test(context)) {
    middlegameTitle = "兵鏈兩端同時施壓";
    middlegameTips = ["用 c 或 f 兵突破攻擊白方中心，並替后翼象尋找活動路線。", "先固定對手弱兵，再把馬放到不容易被兵趕走的前哨格。"];
  } else if (/西西里|Sicilian/.test(context)) {
    middlegameTitle = "不對稱兩翼競速";
    middlegameTips = ["黑方通常在 c 線與后翼反擊；白方則要用發展優勢在王翼製造威脅。", "動手前比較兩翼速度，避免在錯的一側交換主動棋子。"];
  }

  let endgameTitle = "王兵殘局與通路兵";
  let endgameTips = ["后交換後立刻把王帶向中心；先取得對王，再計算兵突破。", "車放在通路兵後方，少走無目的的將軍，優先提高王與車的活動度。"];
  if (/棄兵|Gambit|戰術|Attack/.test(context)) {
    endgameTitle = "棄兵型殘局";
    endgameTips = ["只有在能收回兵或取得更活躍子力時才主動換后；否則保留攻勢。", "若少一兵，保持車與雙方兵翼，利用活動度製造反擊，不要過早交換全部棋子。"];
  } else if (/西西里|Sicilian/.test(context)) {
    endgameTitle = "不對稱兵群殘局";
    endgameTips = ["利用后翼多數兵製造遠方通路兵，同時用王限制對手王翼多數兵。", "車要從側面攻擊孤兵；馬適合封鎖，象則保持兩翼轉換速度。"];
  } else if (/法蘭西|French|卡羅康|Caro-Kann/.test(context)) {
    endgameTitle = "兵鏈與壞象殘局";
    endgameTips = ["先改善被自己兵鏈限制的象，再決定是否交換輕子。", "攻擊兵鏈底部並固定弱兵；好馬對壞象時應保留封鎖格。"];
  } else if (/印度|Indian|Catalan|加泰隆|English|英式|Fianchetto|翼龍/.test(context)) {
    endgameTitle = "長斜線象殘局";
    endgameTips = ["盡量保留側翼象，它能同時照顧兩翼並支援遠方通路兵。", "王走向較弱的一翼，車先佔開放線；避免把所有兵放在與象同色的格子。"];
  } else if (/后兵|Queen|d4/.test(`${identity} ${opening.mainline}`)) {
    endgameTitle = "后兵結構殘局";
    endgameTips = ["少數兵進攻前先控制對手反擊格，目標是製造后翼弱兵而非立即吃兵。", "孤后兵要靠子力活動補償；若無法前進，應準備交換或轉成通路兵。"];
  } else if (/e4 e5|義大利|Italian|西班牙|Ruy Lopez|維也納|Vienna/.test(`${identity} ${opening.mainline}`)) {
    endgameTitle = "開放線輕子殘局";
    endgameTips = ["車先進入開放線，王快速靠近中心；不要讓對手用一枚馬封鎖全部兵。", "象殘局保留兩翼兵，馬殘局則把兵放在馬能保護、對手難攻擊的格子。"];
  }

  return [
    { id: "opening", label: "開局", eyebrow: "OPENING", icon: "Ⅰ", title: "完成部署與王安全", tips: openingTips },
    { id: "middlegame", label: "中局", eyebrow: "MIDDLEGAME", icon: "Ⅱ", title: middlegameTitle, tips: middlegameTips },
    { id: "endgame", label: "殘局", eyebrow: "ENDGAME", icon: "Ⅲ", title: endgameTitle, tips: endgameTips },
  ];
}
