from __future__ import annotations

import io
from pathlib import Path

from PIL import Image

from . import config, imaging, llm

DOC_TYPES = [
    "certificate",
    "diploma",
    "article_or_publication",
    "event_photo",
    "report_page",
    "table_or_spreadsheet",
    "screenshot",
    "letter_or_order",
    "other",
]

VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "document_type": {"type": "string", "enum": DOC_TYPES},
        "extracted_text": {"type": "string"},
        "people": {"type": "array", "items": {"type": "string"}},
        "organizations": {"type": "array", "items": {"type": "string"}},
        "dates": {"type": "array", "items": {"type": "string"}},
        "visual_anomalies": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["description", "document_type", "extracted_text", "people", "organizations", "dates", "visual_anomalies"],
}

VISION_SYSTEM = (
    "Ты — аккуратный аналитик изображений-документов. Описывай ТОЛЬКО то, что действительно видно. "
    "Если текст неразборчив — так и напиши, не догадывайся. Ничего не придумывай. Отвечай на русском языке."
)
VISION_PROMPT = """Проанализируй изображение и верни JSON:
- description: 2–4 предложения — что изображено и что происходит (документ, сертификат, фото мероприятия, скриншот, таблица и т.д.).
- document_type: один из {types}.
- extracted_text: ВЕСЬ читаемый текст дословно, сохраняя язык оригинала и порядок строк (OCR). Если текста нет — пустая строка.
- people: ФИО людей, указанные на изображении (только если написаны).
- organizations: организации/издательства/университеты, указанные на изображении.
- dates: даты, указанные на изображении, в исходном написании.
- visual_anomalies: признаки возможного монтажа, ВИДИМЫЕ глазом (разные шрифты/размеры в одной строке, неровное выравнивание, \
следы стирания/наклейки, неестественные края вставленного текста или печати, несовпадение теней/освещения). Если не видно — пустой список."""


def _prep_for_vlm(path: Path, max_side: int = 1568) -> bytes:
    with Image.open(path) as im:
        im = im.convert("RGB")
        if max(im.size) > max_side:
            im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "PNG")
        return buf.getvalue()


def describe(path: Path | None = None, png_bytes: bytes | None = None) -> dict:
    data = png_bytes if png_bytes is not None else _prep_for_vlm(path)
    return llm.chat_json(
        config.VISION_MODEL,
        VISION_SYSTEM,
        VISION_PROMPT.format(types=", ".join(DOC_TYPES)),
        VISION_SCHEMA,
        images=[data],
        num_ctx=config.VISION_NUM_CTX,
    )


def analyze(path: Path, out_dir: Path, image_id: str, use_vlm: bool = True) -> dict:
    result: dict = {"id": image_id, "filename": path.name, "errors": []}
    integ = imaging.check_integrity(path)
    result["integrity"] = integ
    if integ["status"] == "corrupt":
        result["verdict"] = {"usable": False, "level": "bad", "reasons": integ["problems"]}
        return result

    bgr = imaging._to_bgr(path.read_bytes())
    result["blur"] = imaging.blur_analysis(bgr)

    vlm: dict | None = None
    if use_vlm:
        try:
            vlm = describe(path)
        except Exception as e:
            result["errors"].append(f"Vision-модель ({config.VISION_MODEL}) недоступна: {e}")
    result["vision"] = vlm

    ela_png = out_dir / f"{image_id}_ela.png"
    tamper = imaging.tamper_analysis(path, bgr, ela_png, (vlm or {}).get("visual_anomalies", []))
    if ela_png.exists():
        tamper["ela_heatmap"] = ela_png.name
    result["tamper"] = tamper

    reasons, level = [], "ok"
    if integ["status"] == "warning":
        reasons += integ["problems"]
        level = "warn"
    if result["blur"]["label"] == "blurred":
        reasons.append("Изображение размытое — текст может быть прочитан неверно")
        level = "warn"
    if tamper["risk"] != "low":
        reasons.append(f"Риск монтажа: {tamper['risk']}")
        level = "bad" if tamper["risk"] == "high" else "warn"
    result["verdict"] = {"usable": level != "bad", "level": level, "reasons": reasons}
    return result
