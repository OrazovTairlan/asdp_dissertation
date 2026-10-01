from __future__ import annotations

import re
import uuid
from datetime import UTC, datetime

from .docparse import BLOCK_LINE, MODE_LINE, NUM_ITEM, ParsedDoc, TableData

HEADER_KEYS = {
    "position": ("должност",),
    "activity": ("вид деятельност", "наименование kpi", "наименование показател", "критери"),
    "weight": ("вес",),
    "target": ("целев",),
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace("ё", "е")).strip().casefold()


def _detect_columns(row: list[str]) -> dict[str, int] | None:
    cols: dict[str, int] = {}
    for i, cell in enumerate(row):
        c = _norm(cell)
        if not c:
            continue
        for key, needles in HEADER_KEYS.items():
            if key not in cols and any(c.startswith(n) or n in c for n in needles):
                cols[key] = i
                break
    return cols if {"position", "activity", "weight"} <= cols.keys() else None


def clean_position(raw: str) -> tuple[str, list[str]]:
    name = re.sub(r"^\s*\d+[.)]\s*", "", raw.replace("\n", " ")).strip()
    name = re.sub(r"\s+", " ", name)
    aliases = [a.strip() for a in name.split("/") if a.strip()]
    return name, aliases


def _parse_weight(s: str) -> float | None:
    m = re.search(r"(\d+(?:[.,]\d+)?)", s or "")
    return float(m.group(1).replace(",", ".")) if m else None


def _parse_target(s: str) -> dict:
    s = (s or "").strip()
    if not s:
        return {"raw": "", "kind": "count", "value": 1.0}
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", s)
    if m:
        return {"raw": s, "kind": "percent", "value": float(m.group(1).replace(",", "."))}
    m = re.search(r"(\d+(?:[.,]\d+)?)", s)
    if m:
        return {"raw": s, "kind": "count", "value": float(m.group(1).replace(",", "."))}
    return {"raw": s, "kind": "count", "value": 1.0}


def _parse_block(text: str) -> dict:
    lines = [ln for ln in text.split("\n") if ln.strip()]
    title, mode_text, head_extra = "", "", []
    items: list[dict] = []
    for i, line in enumerate(lines):
        if NUM_ITEM.match(line):
            m = re.match(r"^\s*(\d{1,2})[.)]\s+(.*)$", line, re.S)
            items.append({"num": m.group(1), "text": m.group(2).strip()})
        elif items:
            items[-1]["text"] += " " + line.strip()
        elif BLOCK_LINE.match(line) or (i == 0 and not MODE_LINE.match(line)):
            if not title:
                title = re.sub(r"^\s*Блок\s*\d+\s*[:.]\s*", "", line, flags=re.I).strip()
            else:
                head_extra.append(line)
        elif MODE_LINE.match(line):
            mode_text = line.rstrip(":").strip()
        else:
            head_extra.append(line)
    if not items:
        items = [{"num": "1", "text": " ".join(lines)}]
        title = ""
    if not mode_text:
        mode_text = ""
    mode = "average" if mode_text.casefold().startswith("среднее") else ("any_of" if mode_text else "single")
    return {"title": title, "mode": mode, "mode_text": mode_text, "items": items}


def build_catalog(docs: list[ParsedDoc], name: str = "") -> dict:
    positions: list[dict] = []
    warnings: list[str] = []
    unparsed: list[dict] = []

    for doc in docs:
        warnings += [f"{doc.filename}: {w}" for w in doc.warnings]
        group: dict | None = None
        for t in doc.tables:
            cols = _detect_columns(t.rows[0]) if t.rows else None
            hdr_idx = 0
            if cols is None:
                for k in range(1, min(3, len(t.rows))):
                    cols = _detect_columns(t.rows[k])
                    if cols:
                        hdr_idx = k
                        break
            if cols:
                group = {
                    "cols": cols,
                    "scope": t.context or "основной",
                    "cur_pos": None,
                    "cur_block": None,
                    "width": max(len(r) for r in t.rows),
                    "last_page": t.page,
                }
                data_rows = t.rows[hdr_idx + 1 :]
            elif (
                group
                and (t.page is None or group["last_page"] is None or t.page - group["last_page"] <= 1)
                and max(len(r) for r in t.rows) == group["width"]
            ):
                data_rows = t.rows
                group["last_page"] = t.page
            else:
                unparsed.append({"source": t.source, "page": t.page, "markdown": t.to_markdown()})
                group = None
                continue
            if cols:
                group["last_page"] = t.page
            _consume_rows(group, data_rows, positions, t)

    positions = [p for p in positions if p["blocks"]]
    for idx, p in enumerate(positions):
        p["key"] = f"P{idx + 1}"
        for bi, b in enumerate(p["blocks"]):
            b["id"] = f"{p['key']}-B{bi + 1}"
            for it in b["items"]:
                it["id"] = f"{b['id']}-I{it['num']}"
            b["kind"] = "metric" if (b["mode"] == "average" or b["target"]["kind"] == "percent") else "count"
        total = sum(b["weight"] or 0 for b in p["blocks"])
        p["weight_sum"] = total
        if abs(total - 100) > 0.01:
            warnings.append(
                f"Должность «{p['name']}» ({p['scope']}): сумма весов блоков = {total:g}%, ожидается 100% "
                f"(Положение, п.7). Проверьте разбор таблицы."
            )
        for b in p["blocks"]:
            if b["weight"] is None:
                warnings.append(f"«{p['name']}» → блок «{b['title'] or b['items'][0]['text'][:40]}»: вес не распознан.")

    if not positions:
        warnings.append(
            "Не удалось распознать ни одной таблицы вида «Должность | Вид деятельности | Вес | Целевое значение». "
            "Проверьте формат документа."
        )
    return {
        "id": uuid.uuid4().hex[:10],
        "name": name or ", ".join(d.filename for d in docs),
        "files": [d.filename for d in docs],
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "positions": positions,
        "warnings": warnings,
        "unparsed_tables": unparsed,
        "full_text": "\n\n".join(d.text for d in docs if d.text),
    }


def _consume_rows(group: dict, rows: list[list[str]], positions: list[dict], t: TableData) -> None:
    c = group["cols"]

    def cell(row: list[str], key: str) -> str:
        i = c.get(key)
        return row[i].strip() if i is not None and i < len(row) else ""

    for row in rows:
        pos_raw, act, w_raw, t_raw = (cell(row, k) for k in ("position", "activity", "weight", "target"))
        if not any((pos_raw, act, w_raw, t_raw)):
            continue
        if re.match(r"(?i)^итого", act) or re.match(r"(?i)^итого", pos_raw):
            continue
        if pos_raw:
            name, aliases = clean_position(pos_raw)
            group["cur_pos"] = {
                "name": name,
                "aliases": aliases,
                "scope": group["scope"],
                "blocks": [],
                "source": t.source,
                "page": t.page,
            }
            positions.append(group["cur_pos"])
            group["cur_block"] = None
        cur_pos = group["cur_pos"]
        if cur_pos is None:
            continue
        weight = _parse_weight(w_raw)
        if weight is None and not t_raw and group["cur_block"] is not None and not pos_raw:
            blk = group["cur_block"]
            blk["_raw"] = blk["_raw"] + "\n" + act
            _reparse(blk)
            continue
        if not act:
            continue
        blk = {"_raw": act, "weight": weight, "target": _parse_target(t_raw)}
        _reparse(blk)
        cur_pos["blocks"].append(blk)
        group["cur_block"] = blk


def _reparse(blk: dict) -> None:
    parsed = _parse_block(blk["_raw"])
    blk.update(parsed)
    blk["source_text"] = blk["_raw"]


def public_catalog(cat: dict) -> dict:
    for p in cat["positions"]:
        for b in p["blocks"]:
            b.pop("_raw", None)
    return cat


def find_position_entries(cat: dict, key: str) -> dict | None:
    return next((p for p in cat["positions"] if p["key"] == key), None)
