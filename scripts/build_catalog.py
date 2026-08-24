#!/usr/bin/env python3
"""Build the checked-in JSON-compatible openings.yaml from Lichess CC0 TSV files."""
from __future__ import annotations

import csv
import io
import json
import os
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import chess
import chess.pgn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from chess_library.teaching import enrich_catalog  # noqa: E402


@dataclass(frozen=True)
class Pick:
    side: str
    match: str
    zh: str
    category: str = "主流"


WHITE = [
    Pick("白方", "Italian Game", "義大利開局"), Pick("白方", "Ruy Lopez", "西班牙開局"),
    Pick("白方", "Scotch Game", "蘇格蘭開局"), Pick("白方", "Vienna Game", "維也納開局"),
    Pick("白方", "Four Knights Game", "四馬開局"), Pick("白方", "Ponziani Opening", "龐齊亞尼開局"),
    Pick("白方", "Bishop's Opening", "象開局"), Pick("白方", "King's Gambit", "王翼棄兵", "趣味"),
    Pick("白方", "Danish Gambit", "丹麥棄兵", "趣味"), Pick("白方", "Center Game", "中心開局"),
    Pick("白方", "Sicilian Defense: Alapin Variation", "西西里防禦：阿拉賓變例"),
    Pick("白方", "Sicilian Defense: Closed", "封閉式西西里"),
    Pick("白方", "Sicilian Defense: Smith-Morra Gambit", "史密斯－莫拉棄兵", "趣味"),
    Pick("白方", "Sicilian Defense: Grand Prix Attack", "西西里：大獎賽攻擊"),
    Pick("白方", "French Defense: Advance Variation", "法蘭西防禦：推進變例"),
    Pick("白方", "French Defense: Tarrasch Variation", "法蘭西防禦：塔拉什變例"),
    Pick("白方", "French Defense: Exchange Variation", "法蘭西防禦：兌換變例"),
    Pick("白方", "Caro-Kann Defense: Advance Variation", "卡羅康防禦：推進變例"),
    Pick("白方", "Caro-Kann Defense: Panov Attack", "卡羅康防禦：帕諾夫攻擊"),
    Pick("白方", "Caro-Kann Defense: Maróczy Variation", "卡羅康防禦：幻想變例", "趣味"),
    Pick("白方", "Queen's Gambit", "后翼棄兵"), Pick("白方", "London System", "倫敦體系"),
    Pick("白方", "Rapport-Jobava System", "拉波特－喬巴瓦體系"), Pick("白方", "Colle System", "科勒體系"),
    Pick("白方", "Torre Attack", "托雷攻擊"), Pick("白方", "Trompowsky Attack", "特龍普夫斯基攻擊"),
    Pick("白方", "Catalan Opening", "加泰隆尼亞開局"), Pick("白方", "Richter-Veresov Attack", "里赫特－韋列索夫攻擊"),
    Pick("白方", "Zukertort Opening", "楚克托特開局"), Pick("白方", "Blackmar-Diemer Gambit", "布萊克馬－迪默棄兵", "趣味"),
    Pick("白方", "English Opening", "英國式開局"), Pick("白方", "Réti Opening", "列蒂開局"),
    Pick("白方", "King's Indian Attack", "王翼印度攻擊"), Pick("白方", "Bird Opening", "伯德開局"),
    Pick("白方", "Nimzo-Larsen Attack", "尼姆佐－拉森攻擊"), Pick("白方", "Polish Opening", "波蘭開局"),
    Pick("白方", "Van Geet Opening", "范吉特開局"), Pick("白方", "Hungarian Opening", "匈牙利開局"),
    Pick("白方", "Mieses Opening", "米塞斯開局"), Pick("白方", "Saragossa Opening", "薩拉戈薩開局"),
    Pick("白方", "Grob Opening", "格羅布開局", "趣味"), Pick("白方", "Ware Opening", "韋爾開局", "趣味"),
    Pick("白方", "Amar Opening", "阿馬爾開局", "趣味"), Pick("白方", "Anderssen's Opening", "安德森開局"),
    Pick("白方", "Bongcloud Attack", "雲中王攻擊", "趣味"),
    Pick("白方", "Italian Game: Evans Gambit", "義大利開局：伊凡斯棄兵"),
    Pick("白方", "Scotch Game: Scotch Gambit", "蘇格蘭棄兵"),
    Pick("白方", "Vienna Game: Vienna Gambit", "維也納棄兵"),
    Pick("白方", "Ruy Lopez: Exchange Variation", "西班牙開局：兌換變例"),
    Pick("白方", "Ruy Lopez: Closed", "西班牙開局：封閉變例"),
    Pick("白方", "Sicilian Defense: Open", "開放式西西里"),
    Pick("白方", "Sicilian Defense: Moscow Variation", "西西里防禦：莫斯科變例"),
    Pick("白方", "Sicilian Defense: Nyezhmetdinov-Rossolimo Attack", "西西里防禦：羅索里莫攻擊"),
    Pick("白方", "French Defense: Winawer Variation", "法蘭西防禦：維納維爾變例"),
    Pick("白方", "French Defense: Classical Variation", "法蘭西防禦：古典變例"),
    Pick("白方", "Caro-Kann Defense: Classical Variation", "卡羅康防禦：古典變例"),
    Pick("白方", "Queen's Gambit Declined: Exchange Variation", "后翼棄兵拒絕：兌換變例"),
    Pick("白方", "Catalan Opening: Open Defense", "加泰隆尼亞：開放防禦"),
    Pick("白方", "English Opening: Four Knights System", "英國式開局：四馬體系"),
    Pick("白方", "Réti Opening: Anglo-Slav Variation", "列蒂開局：盎格魯斯拉夫變例"),
]

BLACK = [
    Pick("黑方", "Sicilian Defense", "西西里防禦"), Pick("黑方", "French Defense", "法蘭西防禦"),
    Pick("黑方", "Caro-Kann Defense", "卡羅康防禦"), Pick("黑方", "Scandinavian Defense", "斯堪地那維亞防禦"),
    Pick("黑方", "Pirc Defense", "皮爾茨防禦"), Pick("黑方", "Modern Defense", "現代防禦"),
    Pick("黑方", "Alekhine Defense", "阿廖欣防禦"), Pick("黑方", "Owen Defense", "歐文防禦"),
    Pick("黑方", "Nimzowitsch Defense", "尼姆佐維奇防禦"), Pick("黑方", "St. George Defense", "聖喬治防禦", "趣味"),
    Pick("黑方", "Petrov's Defense", "彼得羅夫防禦"), Pick("黑方", "Philidor Defense", "菲利多爾防禦"),
    Pick("黑方", "Latvian Gambit", "拉脫維亞棄兵", "趣味"), Pick("黑方", "Elephant Gambit", "大象棄兵", "趣味"),
    Pick("黑方", "Italian Game: Two Knights Defense", "義大利開局：雙馬防禦"),
    Pick("黑方", "Ruy Lopez: Berlin Defense", "西班牙開局：柏林防禦"),
    Pick("黑方", "Ruy Lopez: Marshall Attack", "西班牙開局：馬歇爾攻擊"),
    Pick("黑方", "Queen's Gambit Declined", "后翼棄兵拒絕"), Pick("黑方", "Queen's Gambit Accepted", "后翼棄兵接受"),
    Pick("黑方", "Slav Defense", "斯拉夫防禦"), Pick("黑方", "Semi-Slav Defense", "半斯拉夫防禦"),
    Pick("黑方", "King's Indian Defense", "王翼印度防禦"), Pick("黑方", "Grünfeld Defense", "格林菲爾德防禦"),
    Pick("黑方", "Nimzo-Indian Defense", "尼姆佐印度防禦"), Pick("黑方", "Queen's Indian Defense", "后翼印度防禦"),
    Pick("黑方", "Bogo-Indian Defense", "博戈印度防禦"), Pick("黑方", "Old Indian Defense", "古印度防禦"),
    Pick("黑方", "Benoni Defense", "別諾尼防禦"), Pick("黑方", "Benoni Defense: Modern", "現代別諾尼防禦"),
    Pick("黑方", "Benko Gambit", "班科棄兵"), Pick("黑方", "Dutch Defense", "荷蘭防禦"),
    Pick("黑方", "Indian Defense: Budapest Gambit", "布達佩斯棄兵", "趣味"),
    Pick("黑方", "Queen's Gambit Declined: Albin Countergambit", "阿爾賓反棄兵", "趣味"),
    Pick("黑方", "Queen's Gambit Declined: Chigorin Defense", "奇戈林防禦"),
    Pick("黑方", "Tarrasch Defense", "塔拉什防禦"), Pick("黑方", "Englund Gambit", "英格蘭棄兵", "趣味"),
    Pick("黑方", "Polish Defense", "波蘭防禦", "趣味"), Pick("黑方", "English Defense", "英國式防禦"),
    Pick("黑方", "Horwitz Defense", "霍維茨防禦"), Pick("黑方", "English Opening: Symmetrical", "英國式開局：對稱防禦"),
    Pick("黑方", "Mikenas Defense", "米克納斯防禦"), Pick("黑方", "Wade Defense", "韋德防禦"),
    Pick("黑方", "Czech Defense", "捷克防禦"), Pick("黑方", "Hippopotamus Defense", "河馬防禦", "趣味"),
    Pick("黑方", "Blumenfeld Countergambit", "布盧門菲爾德反棄兵", "趣味"),
    Pick("黑方", "Sicilian Defense: Najdorf Variation", "西西里防禦：納道夫變例"),
    Pick("黑方", "Sicilian Defense: Dragon Variation", "西西里防禦：龍式變例"),
    Pick("黑方", "Sicilian Defense: Classical Variation", "西西里防禦：古典變例"),
    Pick("黑方", "Sicilian Defense: Kan Variation", "西西里防禦：康氏變例"),
    Pick("黑方", "Sicilian Defense: Lasker-Pelikan Variation", "西西里防禦：斯維什尼科夫變例"),
    Pick("黑方", "French Defense: Rubinstein Variation", "法蘭西防禦：魯賓斯坦變例"),
    Pick("黑方", "Caro-Kann Defense: Tartakower Variation", "卡羅康防禦：塔塔科維變例"),
    Pick("黑方", "Scandinavian Defense: Portuguese Gambit", "斯堪地那維亞：葡萄牙棄兵"),
    Pick("黑方", "Queen's Gambit Declined: Orthodox Defense", "后翼棄兵拒絕：正統防禦"),
    Pick("黑方", "Queen's Gambit Declined: Cambridge Springs Defense", "后翼棄兵拒絕：劍橋泉防禦"),
    Pick("黑方", "Slav Defense: Chebanenko Variation", "斯拉夫防禦：切巴年科變例"),
    Pick("黑方", "Semi-Slav Defense: Meran Variation", "半斯拉夫防禦：梅蘭變例（米蘭體系）"),
    Pick("黑方", "King's Indian Defense: Orthodox Variation", "王翼印度防禦：正統變例"),
    Pick("黑方", "Nimzo-Indian Defense: Rubinstein System", "尼姆佐印度防禦：魯賓斯坦體系"),
    Pick("黑方", "Dutch Defense: Leningrad Variation", "荷蘭防禦：列寧格勒變例"),
]

# Complete the 149 top-level families in lichess-org/chess-openings.  These
# remain one card per practical opening family; named sub-lines stay inside
# the card as variations instead of flooding the Gallery with 3,810 rows.
WHITE_ALL_FAMILIES = [
    Pick("白方", "Amazon Attack", "亞馬遜攻擊", "趣味"),
    Pick("白方", "Amsterdam Attack", "阿姆斯特丹攻擊", "趣味"),
    Pick("白方", "Barnes Opening", "巴恩斯開局", "趣味"),
    Pick("白方", "Basque Opening", "巴斯克開局", "趣味"),
    Pick("白方", "Canard Opening", "卡納爾開局", "趣味"),
    Pick("白方", "Clemenz Opening", "克萊門茨開局", "趣味"),
    Pick("白方", "Creepy Crawly Formation", "匍匐陣型", "趣味"),
    Pick("白方", "Dresden Opening", "德勒斯登開局"),
    Pick("白方", "English Orangutan", "英國式猴子開局", "趣味"),
    Pick("白方", "Formation", "陣型開局", "趣味"),
    Pick("白方", "Global Opening", "環球開局", "趣味"),
    Pick("白方", "Irish Gambit", "愛爾蘭棄兵"),
    Pick("白方", "King's Indian Attack, with Bf5", "王翼印度攻擊：對…Bf5"),
    Pick("白方", "King's Indian Attack, with e6", "王翼印度攻擊：對…e6"),
    Pick("白方", "King's Knight Opening", "王馬開局"),
    Pick("白方", "King's Pawn Game", "王兵對局"),
    Pick("白方", "King's Pawn Opening", "王兵開局"),
    Pick("白方", "Kádas Opening", "卡達斯開局", "趣味"),
    Pick("白方", "Lasker Simul Special", "拉斯克車輪戰特別開局", "趣味"),
    Pick("白方", "Latvian Gambit Accepted", "拉脫維亞棄兵接受"),
    Pick("白方", "London System, with Bd3", "倫敦體系：象至 d3"),
    Pick("白方", "London System, with Be2", "倫敦體系：象至 e2"),
    Pick("白方", "Marienbad System", "瑪麗安巴德體系"),
    Pick("白方", "Paleface Attack", "蒼白臉攻擊", "趣味"),
    Pick("白方", "Polish Opening, with d5", "波蘭開局：對…d5"),
    Pick("白方", "Portuguese Opening", "葡萄牙開局", "趣味"),
    Pick("白方", "Queen's Pawn Game", "后兵對局"),
    Pick("白方", "Queen's Pawn, Mengarini Attack", "后兵開局：門加里尼攻擊"),
    Pick("白方", "Rapport-Jobava System, with e6", "拉波特－喬巴瓦體系：對…e6"),
    Pick("白方", "Rubinstein Opening", "魯賓斯坦開局"),
    Pick("白方", "Sodium Attack", "鈉攻擊", "趣味"),
    Pick("白方", "Three Knights Opening", "三馬開局"),
    Pick("白方", "Valencia Opening", "華倫西亞開局", "趣味"),
    Pick("白方", "Van't Kruijs Opening", "范特克魯伊斯開局", "趣味"),
    Pick("白方", "Vienna Gambit, with Max Lange Defense", "維也納棄兵：馬克斯蘭格防禦"),
    Pick("白方", "Yusupov-Rubinstein System", "尤蘇波夫－魯賓斯坦體系"),
    Pick("白方", "Blackmar-Diemer Gambit Accepted", "布萊克馬－迪默棄兵接受"),
    Pick("白方", "Blackmar-Diemer Gambit Declined", "布萊克馬－迪默棄兵拒絕"),
]

BLACK_ALL_FAMILIES = [
    Pick("黑方", "Australian Defense", "澳洲防禦", "趣味"),
    Pick("黑方", "Barnes Defense", "巴恩斯防禦", "趣味"),
    Pick("黑方", "Benko Gambit Accepted", "班科棄兵接受"),
    Pick("黑方", "Benko Gambit Declined", "班科棄兵拒絕"),
    Pick("黑方", "Blumenfeld Countergambit Accepted", "布盧門菲爾德反棄兵接受"),
    Pick("黑方", "Borg Defense", "博格防禦", "趣味"),
    Pick("黑方", "Carr Defense", "卡爾防禦"),
    Pick("黑方", "Center Game Accepted", "中心開局接受"),
    Pick("黑方", "Danish Gambit Accepted", "丹麥棄兵接受"),
    Pick("黑方", "Danish Gambit Declined", "丹麥棄兵拒絕"),
    Pick("黑方", "Duras Gambit", "杜拉斯棄兵", "趣味"),
    Pick("黑方", "Döry Defense", "德里防禦"),
    Pick("黑方", "East Indian Defense", "東印度防禦"),
    Pick("黑方", "Englund Gambit Declined", "英格蘭棄兵拒絕"),
    Pick("黑方", "Fried Fox Defense", "炸狐防禦"),
    Pick("黑方", "Goldsmith Defense", "金匠防禦"),
    Pick("黑方", "Gunderam Defense", "貢德蘭防禦"),
    Pick("黑方", "Kangaroo Defense", "袋鼠防禦"),
    Pick("黑方", "King's Gambit Accepted", "王翼棄兵接受"),
    Pick("黑方", "King's Gambit Declined", "王翼棄兵拒絕"),
    Pick("黑方", "Lemming Defense", "旅鼠防禦"),
    Pick("黑方", "Lion Defense", "獅子防禦"),
    Pick("黑方", "Mexican Defense", "墨西哥防禦"),
    Pick("黑方", "Montevideo Defense", "蒙得維的亞防禦"),
    Pick("黑方", "Neo-Grünfeld Defense", "新格林菲爾德防禦"),
    Pick("黑方", "Pseudo Queen's Indian Defense", "類后翼印度防禦"),
    Pick("黑方", "Pterodactyl Defense", "翼龍防禦"),
    Pick("黑方", "Queen's Indian Accelerated", "加速后翼印度防禦"),
    Pick("黑方", "Queen's Indian Defense, with e3", "后翼印度防禦：e3 體系"),
    Pick("黑方", "Queen's Indian Defense, with e3, Bb4+ Line", "后翼印度防禦：e3、Bb4+ 路線"),
    Pick("黑方", "Rat Defense", "鼠式防禦"),
    Pick("黑方", "Robatsch Defense", "羅巴切防禦"),
    Pick("黑方", "Semi-Slav Defense Accepted", "半斯拉夫防禦接受"),
    Pick("黑方", "Slav Indian", "斯拉夫印度防禦"),
    Pick("黑方", "Vulture Defense", "禿鷲防禦"),
    Pick("黑方", "Ware Defense", "韋爾防禦"),
    Pick("黑方", "Zaire Defense", "薩伊爾防禦"),
    Pick("黑方", "Zukertort Defense", "楚克托特防禦"),
]


def slug(text: str) -> str:
    value = unicodedata.normalize("NFKD", text.lower().replace("'", ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:60]


def parse_line(line: str) -> tuple[chess.pgn.Game, int]:
    game = chess.pgn.read_game(io.StringIO(f"[Result \"*\"]\n\n{line} *"))
    if game is None or game.errors:
        raise ValueError(line)
    return game, sum(1 for _ in game.mainline_moves())


def read_rows(paths: list[Path]) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for path in paths:
        with path.open(encoding="utf-8", newline="") as handle:
            rows.extend(csv.DictReader(handle, delimiter="\t"))
    return rows


SOURCE_MATCH_OVERRIDES = {
    # The upstream family was renamed while this catalog keeps the established
    # public title and stable opening id.
    "Benoni Defense: Modern": "Benoni Defense: Modern Variation",
}


def select_rows(rows: list[dict[str, str]], match: str, category: str) -> list[dict[str, str]]:
    source_match = SOURCE_MATCH_OVERRIDES.get(match, match)
    exact = [r for r in rows if r["name"] == source_match]
    descendants = [
        r for r in rows
        if r["name"].startswith(source_match + ":")
        or r["name"].startswith(source_match + ",")
    ]
    found = exact + descendants
    if not found:
        found = [r for r in rows if r["name"].startswith(source_match)]
    if not found:
        raise RuntimeError(f"{match}: no Lichess lines")
    scored = []
    for row in found:
        _, plies = parse_line(row["pgn"])
        name = row["name"]
        score = 50 if 14 <= plies <= 30 else 0
        score -= abs(18 - plies)
        if "Main Line" in name: score += 24
        if any(word in name for word in ("Normal", "Classical", "Traditional")): score += 12
        if name == source_match: score += 80
        if category != "趣味" and any(word in name for word in ("Gambit", "Trap", "Sacrifice")): score -= 35
        score = (score, -abs(18 - plies), -len(name))
        scored.append((score, row))
    ranked = [row for _, row in sorted(scored, key=lambda x: x[0], reverse=True)]
    # A generic card must show the generic recognition line when upstream has
    # one. A named subvariation must likewise remain on its own official PGN.
    # Longer descendant lines are useful as variations, never as invented
    # replacements for the opening itself.
    return sorted(ranked, key=lambda row: row["name"] != source_match)


def recognition_fen(line: str) -> str:
    game, _ = parse_line(line)
    board = game.board()
    for move in game.mainline_moves():
        board.push(move)
    return " ".join(board.fen().split()[:4])


def make_item(pick: Pick, rows: list[dict[str, str]]) -> dict:
    candidates = select_rows(rows, pick.match, pick.category)
    chosen: list[dict[str, str]] = []
    seen_lines: set[str] = set()
    for row in candidates:
        if row["pgn"] not in seen_lines:
            chosen.append(row); seen_lines.add(row["pgn"])
        if len(chosen) == 4: break
    mainline = chosen[0]["pgn"]
    variations = []
    for index, row in enumerate(chosen[1:4], 1):
        line = row["pgn"]
        name = row["name"].split(":", 1)[-1].strip()
        variations.append({"name": name, "line": line, "note": "比較兵形、子力配置與典型突破時機。"})
    tactical = pick.category == "趣味" or any(x in pick.match for x in ("Gambit", "Attack"))
    styles = ["戰術", "主動"] if tactical else (["穩健", "局面"] if pick.side == "黑方" else ["局面", "發展"])
    opening_id = ("w-" if pick.side == "白方" else "b-") + slug(pick.match)
    if tactical:
        ideas = f"{pick.zh}重視主動權、開放線與發展速度。先確認中心張力，再用有節奏的出子製造戰術威脅。"
        plans = ["快速完成發展並搶先控制開放線", "利用中心交換打開后與象的攻擊路徑", "計算犧牲前先確認後續兩至三步的強制手段"]
    elif pick.side == "黑方":
        ideas = f"{pick.zh}的目標是先限制白方中心，再選擇反擊或簡化。重點是兵形完整、王的安全與反擊時機。"
        plans = ["完成發展並準備挑戰白方中心", "根據兵形選擇翼側反擊或中心突破", "交換白方最活躍的攻擊子力後改善弱子"]
    else:
        ideas = f"{pick.zh}以穩定的中心控制和協調發展建立中局。先完成王車易位，再依兵形選擇王翼或后翼計畫。"
        plans = ["把輕子部署到不阻塞中心兵的位置", "完成王車易位後連接雙車", "用兵突破取得空間或製造弱兵"]
    return {
        "id": opening_id, "title_zh": pick.zh, "title_en": pick.match,
        "aliases": [], "side": pick.side, "category": pick.category,
        "eco": chosen[0]["eco"], "first_move": first_move(mainline), "styles": styles,
        "difficulty": "初中階", "mainline": mainline, "variations": variations,
        "ideas": ideas,
        "plans": plans,
        "mistakes": ["重複移動同一枚棋子而落後發展", "過早出后並遭到節奏攻擊", "未確認中心是否安全就發動翼側攻勢"],
        "source": {
            "dataset": "lichess-org/chess-openings",
            "license": "CC0-1.0",
            "name": chosen[0]["name"],
            "pgn": mainline,
            "epd": recognition_fen(mainline),
        },
    }


def first_move(line: str) -> str:
    game, _ = parse_line(line)
    move = next(iter(game.mainline_moves()))
    return {chess.E2: "e4", chess.D2: "d4", chess.C2: "c4", chess.G1: "Nf3"}.get(move.from_square, "其他")


def main(argv: list[str]) -> int:
    paths = [Path(p) for p in argv] if argv else [Path(f"/private/tmp/chess-openings-{c}.tsv") for c in "abcde"]
    rows = read_rows(paths)
    picks = WHITE + WHITE_ALL_FAMILIES + BLACK + BLACK_ALL_FAMILIES
    if (
        len(WHITE) + len(WHITE_ALL_FAMILIES) != 98
        or len(BLACK) + len(BLACK_ALL_FAMILIES) != 98
        or sum(p.category == "趣味" for p in picks) != 39
    ):
        raise RuntimeError("selection quota is invalid")
    data = enrich_catalog({
        "schema_version": 1,
        "source": "Lichess chess-openings (CC0-1.0)",
        "openings": [make_item(p, rows) for p in picks],
    })
    output = Path(os.environ.get("CHESS_CATALOG_OUTPUT", ROOT / "openings.yaml"))
    output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(picks)} openings")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
