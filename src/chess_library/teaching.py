from __future__ import annotations

import copy
import io
import json
from pathlib import Path
from typing import Any

import chess
import chess.pgn

from .catalog import DEFAULT_CATALOG, CatalogError, validate_catalog


def _profile(item: dict[str, Any]) -> tuple[str, list[str], list[str]]:
    name = item["title_en"].lower()
    title = item["title_zh"]
    side = item["side"]

    if "sicilian" in name:
        if side == "白方":
            ideas = f"{title}以限制黑方后翼反擊並爭取先手為核心；依體系選擇 d4 中心突破或 f4 王翼擴張。"
            plans = [f"在{title}中先完成發展，再判斷 d4 是否能安全打開中心", "控制 d5 格，避免黑方用…d5 一次解放局面", "黑方在后翼推兵時，以王翼空間或中央開線製造對攻"]
            mistakes = ["尚未完成發展就盲目發動王翼兵攻，讓中央先被打開", "忽略 c 線與后翼壓力，使 c2 或 d4 成為長期弱點", "把所有子力堆向同一翼，卻沒有防範黑方的…d5 反擊"]
        else:
            ideas = f"{title}以不對稱兵形換取主動反擊；黑方接受較少空間，目標是在 c 線、后翼或…d5 突破中取得動態平衡。"
            plans = [f"在{title}中以…d6／…e6鞏固中心，完成出子後爭取…d5", "利用半開 c 線向 c2 施壓，並用…a6、…b5取得后翼空間", "白方王翼進攻成形前，交換關鍵攻擊子或在中央製造反擊"]
            mistakes = ["只在后翼推兵而忽略王翼安全，讓白方攻勢帶著節奏到達", "條件不足時強行…d5，導致中心兵或 e6 格成為戰術弱點", "把后翼馬固定在被動位置，未安排…Nc6、…Nbd7 或…b5 的協調"]
    elif "french defense" in name:
        if side == "白方":
            ideas = f"{title}圍繞 e5–d4 兵鏈與空間優勢展開；白方要在黑方以…c5、…f6 攻擊兵鏈前完成發展。"
            plans = [f"在{title}中支援 d4，並依兵形準備 c3、f4 或 c4", "利用 f4–f5 或后翼空間固定黑方弱點", "交換黑方最活躍的輕子，保留能支撐 e5 的子力"]
            mistakes = ["只顧保住 e5 兵，卻讓 d4 兵鏈根部在…c5 後崩解", "后翼尚未發展就推過多王翼兵，延誤王車易位", "在中心封閉時無計畫交換空間優勢，進入沒有目標的局面"]
        else:
            ideas = f"{title}先以…e6建立穩固中心，再用…c5與…f6攻擊白方兵鏈；關鍵是解放 c8 象。"
            plans = [f"在{title}中優先準備…c5，直接攻擊 d4 兵鏈根部", "安排…Nc6、…Qb6 或…f6增加中心壓力", "以…Bd7–b5、…b6–Ba6 或交換手段改善 c8 象"]
            mistakes = ["長期封住 c8 象卻沒有解放計畫，讓白方從容擴張", "過早…f6而王仍留在中央，遭到 e 線或對角線戰術", "只攻擊 e5 兵尖，忽略真正應施壓的 d4 兵鏈根部"]
    elif "caro-kann" in name:
        if side == "白方":
            ideas = f"{title}利用先手與空間限制黑方順利完成…c5或…e5；白方須把空間轉成有效突破，而不是只維持兵鏈。"
            plans = [f"在{title}中依兵形用 c4、h4–h5 或 Bd3 增加壓力", "控制 e5 與 d5 周邊格，延後黑方的中心解放", "黑方完成發展前打開一條線，但保持己王有安全去處"]
            mistakes = ["為追擊已出動的黑方象而推太多兵，留下無法回補的弱格", "在…c5 即將出現時忽略 d4 兵的保護", "把空間優勢誤當成直接攻勢，未先完成后翼發展"]
        else:
            ideas = f"{title}以…c6與…d5建立健全兵形，通常先把 c8 象發展到 f5 或 g4，再以…c5或…e5反擊。"
            plans = [f"在{title}中先完成后翼象發展，再用…e6鞏固中心", "準備…c5挑戰 d4，或在適當交換後爭取…e5", "以穩固王位和清楚兵形把白方先手逐步消化"]
            mistakes = ["先走…e6把 c8 象鎖住，卻沒有後續解放方案", "為了保兵被迫重複走后，讓白方免費取得發展節奏", "過度簡化但留下壞象或孤立弱兵，使穩健兵形失去意義"]
    elif any(key in name for key in ("queen's gambit", "slav", "semi-slav", "tarrasch", "chigorin")):
        if side == "白方":
            ideas = f"{title}以 d4 與 c4 建立后翼空間，透過中心張力限制黑方自由出子，再選擇 e4 突破或少數兵攻擊。"
            plans = [f"在{title}中先完成 Nc3、Nf3 與王車易位，再決定 cxd5 或 e4", "利用 c 線與后翼兵多數向 c6、b7 等目標施壓", "中心交換後迅速佔領 e5、c5 或開放線，而不是無目的換子"]
            mistakes = ["過早解除中心張力，讓黑方輕鬆發展壞象", "只盯著 c4 棄兵，為奪回一兵浪費多個節奏", "少數兵攻擊尚未準備完成就推 b 兵，留下 c3 或 a3 弱點"]
        else:
            ideas = f"{title}的核心是承受白方 c4 壓力並及時反擊中心；黑方必須替 c8 象與…c5或…e5找到可行時機。"
            plans = [f"在{title}中先穩固 d5，再以…c5或…e5挑戰白方中心", "安排…Nbd7、…Be7 與王車易位，避免后翼子力互相阻塞", "中心簡化後爭取 c 線活動，或攻擊白方孤后兵與后翼弱兵"]
            mistakes = ["被動守住 d5 卻從未準備中心反擊，讓白方逐步增加壓力", "后翼馬與 c8 象走位衝突，導致發展擁塞", "接受 c4 兵後貪兵不還，讓白方以 e4 和快速發展取得補償"]
    elif any(key in name for key in ("indian", "benoni", "benko", "grünfeld", "dutch", "blumenfeld")):
        if side == "黑方":
            ideas = f"{title}允許白方建立較大中心，再以子力壓迫和兵突破反擊；成敗取決於…c5、…e5或…f5的時機。"
            plans = [f"在{title}中先完成王翼發展，確認主要反擊是…c5、…e5還是…f5", "利用長對角線、半開線或后翼兵推攻擊白方中心根部", "白方中心前進時攻擊其後方弱格，不用兵對稱地被動阻擋"]
            mistakes = ["讓白方中心毫無代價地推進，卻沒有對應的兵突破", "長對角線仍被自己的兵封住時就交換活躍子力", "王翼兵推與王的安全脫節，給白方直接開線的機會"]
        else:
            ideas = f"{title}以穩定空間和中心控制限制黑方超現代反擊；白方要鞏固中心，同時避免兵鏈成為攻擊目標。"
            plans = [f"在{title}中用 e4、d4 或 c4 建立中心後，完成發展再決定推進", "限制黑方主題性突破，並控制突破後留下的弱格", "后翼擴張與王翼安全並進，不讓中心過度延伸"]
            mistakes = ["中心兵推得太遠卻缺乏子力支援，成為黑方攻擊目標", "低估長對角線壓力，在中心開線時暴露王與車", "只用兵搶空間而落後發展，使黑方每次反擊都帶節奏"]
    elif any(key in name for key in ("english", "réti", "reti", "catalan", "bird", "larsen", "zukertort")):
        ideas = f"{title}以側翼控制中心並保留轉置彈性；重點不是立刻佔滿中心，而是看準 d4、e4、c5 或 e5 的突破時機。"
        plans = [f"在{title}中先以兵與象控制中心格，再依黑方配置決定中心兵形", "利用長對角線與半開線向后翼施壓", "保留轉置選項，但在對手完成理想配置前確立自己的中心計畫"]
        mistakes = ["為追求彈性而連續等待，讓對手毫無阻力地佔領完整中心", "長對角線被自己的中心兵封住，卻沒有安排兵突破", "不辨識轉置後的兵形，仍照搬原開局的固定走法"]
    elif any(key in name for key in ("ruy lopez", "italian", "scotch", "vienna", "four knights", "ponziani", "bishop's opening", "petrov", "philidor")):
        ideas = f"{title}由開放王兵局面出發，核心是快速發展、爭奪 d4／d5，並利用中心開線建立子力活動。"
        plans = [f"在{title}中完成王翼發展與王車易位，再準備 d4 或…d5 中心突破", "把車放到即將打開的 e 線或 d 線，提升每次交換的效果", "對手中心尚未穩固時，以帶節奏的出子逼出弱點"]
        mistakes = ["在王仍居中時打開 e 線，使每次交換都替對手增加攻擊", "重複移動同一攻擊子，卻讓其餘子力留在原位", "只攻擊 f7／f2 的表面弱點，忽略中心反擊與退路"]
    elif any(key in name for key in ("scandinavian", "pirc", "modern defense", "alekhine", "owen", "nimzowitsch defense")):
        ideas = f"{title}主動誘導白方中心前進，再用兵突破和子力攻擊中心；黑方必須用節奏證明早期讓出空間是合理的。"
        plans = [f"在{title}中完成王翼發展後，立即準備攻擊白方中心根部", "用…c5、…e5或…f6迫使白方中心做出決定", "交換白方最能支撐空間的子力，轉入可攻擊弱兵的中局"]
        mistakes = ["只讓白方佔中心，卻遲遲沒有安排任何突破", "后或馬被白方兵帶節奏追趕，造成持續落後發展", "中心尚未被固定就從翼側進攻，使白方能在中央開線"]
    elif item.get("category") == "趣味":
        ideas = f"{title}屬於非主流或趣味體系，價值在於製造陌生局面；使用時仍要以發展、中心與王安全作為底線。"
        plans = [f"在{title}中先確認早期兵步換來的具體格子或攻擊線", "對手穩健應對時迅速回到正常發展，不勉強追求陷阱", "利用對手思考時間與陌生感，但為中局保留健全兵形"]
        mistakes = ["把開局名稱當成戰術保證，對手不中陷阱後仍繼續冒險", "走過多邊兵或馬邊線，讓中心與王翼無人防守", "為了保持奇襲性拒絕自然發展，導致位置性劣勢累積"]
    else:
        ideas = f"{title}以協調發展和中心控制進入可下的中局；計畫須依實際兵形，而不是機械背誦走法。"
        plans = [f"在{title}中先完成輕子發展與王車易位，再選擇中心突破", "找出最差位置的棋子並改善它，而不是重複移動活躍子", "依開放線與兵鏈方向選擇進攻翼側"]
        mistakes = ["未判斷中心是否會打開就推動翼側兵", "交換掉唯一活躍子，留下無法改善的壞子", "只記走法順序，忽略對手偏離主線後的新威脅"]

    if "gambit" in name or "countergambit" in name:
        plans[2] = "把棄兵轉化為發展領先、開放線或持續先手，不以立刻奪回兵為唯一目標"
        mistakes[0] = "只計算犧牲的第一步，沒有確認後續兩至三步是否仍有強制手段"
    return ideas, plans, mistakes


def _moves(line: str) -> tuple[chess.Board, list[chess.Move]]:
    game = chess.pgn.read_game(io.StringIO(f'[Result "*"]\n\n{line} *'))
    if game is None or game.errors:
        raise CatalogError(f"教學棋路不是合法 PGN：{game.errors if game else '空白'}")
    return game.board(), list(game.mainline_moves())


def variation_note(title: str, mainline: str, variation_name: str, variation_line: str) -> str:
    board, main_moves = _moves(mainline)
    _, variation_moves = _moves(variation_line)
    index = 0
    while index < min(len(main_moves), len(variation_moves)) and main_moves[index] == variation_moves[index]:
        board.push(main_moves[index])
        index += 1
    if index < len(variation_moves):
        san = board.san(variation_moves[index])
        move_number = index // 2 + 1
        mover = "白方" if index % 2 == 0 else "黑方"
        branch = f"在第 {move_number} 回合由{mover}走 {san} 分歧"
    else:
        branch = f"延伸代表主線至第 {(len(variation_moves) + 1) // 2} 回合"
    return f"{title}的「{variation_name}」{branch}；比較中心張力、王安全與最差子力，找出此線專屬的突破時機。"


def enrich_catalog(data: dict[str, Any]) -> dict[str, Any]:
    enriched = copy.deepcopy(data)
    validate_catalog(enriched, require_scores=False)
    for item in enriched["openings"]:
        item["ideas"], item["plans"], item["mistakes"] = _profile(item)
        for variation in item["variations"]:
            variation["note"] = variation_note(
                item["title_zh"], item["mainline"], variation["name"], variation["line"],
            )
    validate_catalog(enriched, require_scores=all("popularity_pct" in item for item in enriched["openings"]))
    return enriched


def enrich_teaching(catalog_path: Path = DEFAULT_CATALOG) -> dict[str, int | str]:
    try:
        data = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CatalogError(f"無法讀取開局資料：{exc}") from exc
    enriched = enrich_catalog(data)
    temporary = catalog_path.with_suffix(catalog_path.suffix + ".tmp")
    temporary.write_text(json.dumps(enriched, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(catalog_path)
    variation_count = sum(len(item["variations"]) for item in enriched["openings"])
    return {"openings": len(enriched["openings"]), "variations": variation_count, "status": "complete"}
