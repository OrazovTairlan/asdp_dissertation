from __future__ import annotations

import json
import re
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

from . import config, evaluate, llm, vision
from .docparse import parse_file, render_pdf_pages

IMAGE_EXT = config.IMAGE_EXT
DOC_EXT = config.DOC_EXT

_LOCK = threading.Lock()


def sub_dir(sub_id: str) -> Path:
    return config.SUBMISSION_DIR / sub_id


def load_state(sub_id: str) -> dict | None:
    f = sub_dir(sub_id) / "state.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None


def save_state(state: dict) -> None:
    f = sub_dir(state["id"]) / "state.json"
    tmp = f.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def create_submission(
    catalog_id: str, files: list[tuple[str, bytes]], employee: str, position_key: str, scope_index: int
) -> dict:
    sid = uuid.uuid4().hex[:10]
    d = sub_dir(sid)
    (d / "uploads").mkdir(parents=True)
    names = []
    for name, data in files:
        safe = re.sub(r"[^\w.\- ()]", "_", Path(name).name, flags=re.U) or "file"
        p = d / "uploads" / safe
        n = 1
        while p.exists():
            p = d / "uploads" / f"{p.stem}_{n}{p.suffix}"
            n += 1
        p.write_bytes(data)
        names.append(p.name)
    state = {
        "id": sid,
        "catalog_id": catalog_id,
        "employee": employee,
        "files": names,
        "position_key": position_key,
        "scope_index": scope_index,
        "status": "queued",
        "steps": [],
        "result": None,
        "error": None,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    save_state(state)
    return state


def _image_text(r: dict) -> str:
    v = r.get("vision") or {}
    if not v:
        return ""
    parts = [f"Описание изображения (сгенерировано моделью): {v.get('description', '')}", f"Тип: {v.get('document_type', '')}"]
    if v.get("extracted_text"):
        parts.append("Текст на изображении (OCR):\n" + v["extracted_text"])
    for key, label in (("people", "Люди"), ("organizations", "Организации"), ("dates", "Даты")):
        if v.get(key):
            parts.append(f"{label}: " + "; ".join(v[key]))
    return "\n".join(parts)


def process(sub_id: str, catalog: dict, reuse: bool = False) -> None:
    state = load_state(sub_id)
    t0 = time.time()

    def step(msg: str) -> None:
        state["steps"].append({"t": round(time.time() - t0, 1), "msg": msg})
        save_state(state)

    with _LOCK:
        try:
            state.update(status="running", error=None)
            if not reuse:
                state["steps"] = []
            d = sub_dir(sub_id)
            art_file = d / "artifacts.json"
            warnings: list[str] = []

            if reuse and art_file.exists():
                art = json.loads(art_file.read_text(encoding="utf-8"))
                segments, images = art["segments"], art["images"]
                step("Повторный расчёт по сохранённым результатам анализа файлов")
            else:
                segments, images = [], {}
                for fname in state["files"]:
                    path = d / "uploads" / fname
                    ext = path.suffix.lower()
                    if ext in IMAGE_EXT:
                        step(f"Изображение «{fname}»: целостность, резкость, признаки монтажа, описание (vision)…")
                        iid = f"img{len(images) + 1}"
                        res = vision.analyze(path, d, iid)
                        images[iid] = res
                        txt = _image_text(res)
                        if txt:
                            segments.append({"label": f"изображение «{fname}»", "text": txt, "image_id": iid})
                    elif ext in DOC_EXT:
                        step(f"Документ «{fname}»: извлечение текста и таблиц…")
                        try:
                            doc = parse_file(path)
                        except Exception as e:
                            warnings.append(f"{fname}: не удалось прочитать ({e})")
                            continue
                        text = doc.full_markdown()
                        if text.strip():
                            segments.append({"label": f"документ «{fname}»", "text": text, "image_id": None})
                        if doc.needs_ocr_pages and ext == ".pdf":
                            for pno, png in render_pdf_pages(path, doc.needs_ocr_pages):
                                step(f"«{fname}», стр. {pno}: скан — распознавание через vision-модель…")
                                try:
                                    v = vision.describe(png_bytes=png)
                                    if v.get("extracted_text"):
                                        segments.append(
                                            {
                                                "label": f"документ «{fname}», стр. {pno} (OCR)",
                                                "text": v["extracted_text"],
                                                "image_id": None,
                                            }
                                        )
                                except Exception as e:
                                    warnings.append(f"{fname}, стр. {pno}: OCR не выполнен ({e})")
                    else:
                        warnings.append(f"{fname}: формат не поддерживается")
                art_file.write_text(json.dumps({"segments": segments, "images": images}, ensure_ascii=False), encoding="utf-8")

            for img in images.values():
                v = img.get("verdict", {})
                for e in img.get("errors", []):
                    warnings.append(f"{img['filename']}: {e}")
                if v.get("level") == "bad":
                    warnings.append(
                        f"«{img['filename']}» не принято как подтверждение автоматически: {'; '.join(v.get('reasons', []))}"
                    )
                elif v.get("level") == "warn":
                    warnings.append(f"«{img['filename']}»: {'; '.join(v.get('reasons', []))}")

            full_text = "\n".join(s["text"] for s in segments)
            doc_text = "\n".join(s["text"] for s in segments if not s.get("image_id")) or full_text

            step("Определение должности сотрудника…")
            pos = evaluate.resolve_position(catalog, doc_text, state.get("position_key") or None)
            em = re.search(r"(?im)^\s*(?:фио|сотрудник|ф\.и\.о\.?)\s*[:\-–—]\s*(.+?)\s*$", doc_text)
            employee = state.get("employee") or (em.group(1) if em else "")

            result = {
                "employee": employee,
                "position": None,
                "scope": None,
                "images": images,
                "warnings": warnings,
                "positions_available": sorted({p["name"] for p in catalog["positions"]}),
                "run_config": llm.run_info(),
                "disclaimer": "Предварительная автоматическая оценка. Итоговое решение принимает Комиссия по оценке KPI (Положение, разд. 6).",
            }
            if not pos["entries"]:
                result["status"] = "needs_position"
                warnings.append("Должность не определена. Укажите её вручную и пересчитайте.")
            elif not segments:
                result["status"] = "no_content"
                warnings.append("Не удалось получить текст из загруженных файлов.")
            else:
                entries = pos["entries"]
                si = min(max(int(state.get("scope_index") or 0), 0), len(entries) - 1)
                entry = entries[si]
                result["position"] = {"name": pos["name"], "source": pos["source"], "key": entry["key"]}
                result["scope"] = {"index": si, "label": entry["scope"], "options": [e["scope"] for e in entries]}
                if len(entries) > 1:
                    warnings.append(
                        f"Для должности в документе организации несколько вариантов карты KPI; применён: «{entry['scope']}»."
                    )
                step(f"Должность: {pos['name']} ({pos['source']}). Оценка блоков KPI моделью {config.TEXT_MODEL}…")
                ev = evaluate.evaluate(entry, segments, images, progress=step)
                result.update(ev)
                result["status"] = "done"
                result["weights_total"] = entry["weight_sum"]
                result["kpi_total_pct"] = ev["kpi_total"]
                for f in ev.get("injection_flags", []):
                    warnings.append(
                        f"⚠ В документе ({f['source']}) найдена фраза, похожая на попытку повлиять на оценку: «{f['fragment']}». "
                        "На расчёт она не влияет, но результат стоит проверить вручную."
                    )
                if ev.get("rejected_achievements"):
                    warnings.append(
                        f"Отброшено {len(ev['rejected_achievements'])} достижений: цитата модели не найдена в документах."
                    )
                for b in ev["blocks"]:
                    if b["rejected"]:
                        warnings.append(
                            f"Блок «{b['title']}»: отброшено {len(b['rejected'])} сопоставлений модели без подтверждающей цитаты."
                        )
            state["result"] = result
            state["status"] = "done"
            step("Готово")
        except Exception as e:
            state["status"] = "error"
            state["error"] = f"{type(e).__name__}: {e}"
            step(f"Ошибка: {state['error']}")
        finally:
            save_state(state)


def start(sub_id: str, catalog: dict, reuse: bool = False) -> None:
    threading.Thread(target=process, args=(sub_id, catalog, reuse), daemon=True).start()


def recover_interrupted() -> int:
    n = 0
    for d in config.SUBMISSION_DIR.iterdir():
        st = load_state(d.name) if d.is_dir() else None
        if st and st.get("status") in ("queued", "running"):
            st.update(status="error", error="Обработка прервана перезапуском сервера — запустите оценку заново.")
            save_state(st)
            n += 1
    return n
