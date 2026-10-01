from __future__ import annotations

import io
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import ExifTags, Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False

EDITORS = re.compile(
    r"photoshop|gimp|paint\.net|pixlr|canva|snapseed|lightroom|affinity|corel|fotor|picsart|"
    r"photopea|facetune|meitu|remini|stable diffusion|midjourney|dall-?e|firefly",
    re.I,
)
EXIF_TAGS = {v: k for k, v in ExifTags.TAGS.items()}

BLUR_SHARP = 120.0
BLUR_SLIGHT = 40.0


def check_integrity(path: Path) -> dict:
    res = {"status": "ok", "problems": [], "format": None, "width": None, "height": None, "size_bytes": path.stat().st_size}
    data = path.read_bytes()
    if len(data) < 100:
        return {**res, "status": "corrupt", "problems": ["Файл пустой или слишком мал"]}
    try:
        with Image.open(io.BytesIO(data)) as im:
            res["format"], (res["width"], res["height"]) = im.format, im.size
            im.verify()
    except Exception as e:
        return {**res, "status": "corrupt", "problems": [f"Файл не открывается как изображение: {e}"]}
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
    except Exception as e:
        return {**res, "status": "corrupt", "problems": [f"Данные изображения повреждены/обрезаны: {e}"]}

    ext = path.suffix.lower().lstrip(".")
    fmt = (res["format"] or "").lower()
    norm = {"jpg": "jpeg"}
    if ext and norm.get(ext, ext) != fmt and not (ext in ("tif", "tiff") and fmt == "tiff"):
        res["problems"].append(f"Расширение .{ext} не соответствует реальному формату {res['format']}")
    if fmt == "jpeg" and not data.rstrip(b"\x00").endswith(b"\xff\xd9"):
        res["problems"].append("JPEG не завершён маркером конца файла (возможна обрезка при передаче)")
    if min(res["width"], res["height"]) < 300:
        res["problems"].append(f"Очень низкое разрешение {res['width']}×{res['height']}")

    gray = cv2.cvtColor(_to_bgr(data), cv2.COLOR_BGR2GRAY)
    h = gray.shape[0]
    flat_rows = np.where(gray.std(axis=1) < 1.0)[0]
    if len(flat_rows):
        tail = 0
        for r in range(h - 1, -1, -1):
            if r in set(flat_rows[-int(h * 0.6) :]):
                tail += 1
            else:
                break
        if tail > h * 0.15 and 0 < gray[-1].mean() < 255 and 100 <= gray[-1].mean() <= 140:
            res["problems"].append(f"Нижние {tail * 100 // h}% изображения — однородный серый блок (признак обрыва данных)")
    if res["problems"]:
        res["status"] = "warning" if not any("обрыва" in p or "обрезка" in p for p in res["problems"]) else "corrupt"
    return res


def _to_bgr(data: bytes) -> np.ndarray:
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
    return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)


def blur_analysis(bgr: np.ndarray) -> dict:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    scale = 1024 / max(h, w)
    if scale < 1:
        gray = cv2.resize(gray, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    h, w = gray.shape
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    gh, gw = max(1, h // 64), max(1, w // 64)
    vals = []
    for i in range(gh):
        for j in range(gw):
            ys, xs = slice(i * h // gh, (i + 1) * h // gh), slice(j * w // gw, (j + 1) * w // gw)
            tile = gray[ys, xs]
            if tile.std() < 6:
                continue
            vals.append(lap[ys, xs].var())
    if len(vals) < max(2, gh * gw * 0.02):
        return {"score": None, "label": "unknown", "text": "Недостаточно контента для оценки резкости (почти пустое изображение)"}
    score = float(np.percentile(vals, 90))
    if score >= BLUR_SHARP:
        label, text = "sharp", "Резкое"
    elif score >= BLUR_SLIGHT:
        label, text = "slight", "Слегка размытое"
    else:
        label, text = "blurred", "Размытое"
    return {"score": round(score, 1), "label": label, "text": text, "thresholds": {"sharp": BLUR_SHARP, "slight": BLUR_SLIGHT}}


def exif_signals(path: Path) -> tuple[list[dict], dict]:
    signals, meta = [], {}
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            fmt = im.format
            info_sw = str(im.info.get("Software", "") or im.info.get("software", ""))
            if exif:
                sub = exif.get_ifd(0x8769) if hasattr(exif, "get_ifd") else {}
                get = lambda tag: exif.get(EXIF_TAGS.get(tag)) or sub.get(EXIF_TAGS.get(tag))
                meta = {
                    k: str(v)
                    for k, v in {
                        "Software": get("Software"),
                        "Make": get("Make"),
                        "Model": get("Model"),
                        "DateTime": get("DateTime"),
                        "DateTimeOriginal": get("DateTimeOriginal"),
                    }.items()
                    if v
                }
            sw = meta.get("Software") or info_sw
            if sw:
                meta["Software"] = sw
                if EDITORS.search(sw):
                    signals.append(
                        {"name": "exif_editor", "weight": 3, "text": f"В метаданных указана программа обработки: «{sw}»"}
                    )
            d1, d2 = meta.get("DateTime"), meta.get("DateTimeOriginal")
            if d1 and d2 and d1 != d2:
                signals.append(
                    {"name": "exif_dates", "weight": 1, "text": f"Дата изменения ({d1}) отличается от даты съёмки ({d2})"}
                )
            if fmt == "JPEG" and not exif:
                signals.append(
                    {
                        "name": "exif_missing",
                        "weight": 0,
                        "text": "У JPEG нет EXIF (метаданные удалены или файл пересохранён/получен из мессенджера)",
                    }
                )
    except Exception:
        pass
    return signals, meta


def ela_analysis(path: Path, out_png: Path | None = None) -> dict:
    with Image.open(path) as im:
        fmt = im.format
        rgb = im.convert("RGB")
    if fmt != "JPEG":
        return {"applicable": False, "reason": f"ELA применим к JPEG, формат файла — {fmt}"}
    buf = io.BytesIO()
    rgb.save(buf, "JPEG", quality=90)
    buf.seek(0)
    re_img = Image.open(buf).convert("RGB")
    a, b = np.asarray(rgb, dtype=np.float32), np.asarray(re_img, dtype=np.float32)
    diff = np.abs(a - b).mean(axis=2)
    bs = 16
    h, w = diff.shape
    hh, ww = h // bs * bs, w // bs * bs
    blocks = diff[:hh, :ww].reshape(hh // bs, bs, ww // bs, bs).mean(axis=(1, 3))
    gray = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2GRAY)[:hh, :ww]
    tex = gray.reshape(hh // bs, bs, ww // bs, bs).std(axis=(1, 3))
    active = blocks[tex > 6]
    if active.size < 30:
        return {"applicable": True, "anomaly": False, "ratio": None, "note": "мало текстурных областей"}
    med = float(np.median(active))
    p99 = float(np.percentile(active, 99))
    ratio = p99 / (med + 1e-3)
    hot = float((active > med * 3.0 + 1.0).mean())
    anomaly = ratio > 3.0 and 0.001 <= hot < 0.5
    if out_png is not None:
        heat = np.clip(diff * (255.0 / max(diff.max(), 1e-3)) * 1.0, 0, 255).astype(np.uint8)
        heat = cv2.applyColorMap(heat, cv2.COLORMAP_INFERNO)
        cv2.imwrite(str(out_png), cv2.resize(heat, (min(w, 900), int(h * min(w, 900) / w))))
    return {"applicable": True, "anomaly": bool(anomaly), "ratio": round(ratio, 2), "hot_fraction": round(hot, 4)}


def noise_analysis(bgr: np.ndarray) -> dict:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    s = 1400 / max(h, w)
    if s < 1:
        gray = cv2.resize(gray, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    resid = gray.astype(np.float32) - cv2.medianBlur(gray, 3).astype(np.float32)
    bs = 32
    h, w = gray.shape
    vals = []
    for y in range(0, h - bs, bs):
        for x in range(0, w - bs, bs):
            t = gray[y : y + bs, x : x + bs]
            if t.std() < 6:
                continue
            vals.append(resid[y : y + bs, x : x + bs].std())
    if len(vals) < 40:
        return {"anomaly": False, "note": "мало текстурных областей"}
    v = np.array(vals)
    med = np.median(v)
    mad = np.median(np.abs(v - med)) + 1e-3
    z = (v - med) / (1.4826 * mad)
    frac = float((np.abs(z) > 6).mean())
    return {"anomaly": bool(0.01 < frac < 0.25 and (v.max() / (med + 1e-3)) > 3.0), "outlier_fraction": round(frac, 4)}


def _is_text_document(gray: np.ndarray) -> bool:
    q = (gray // 16).ravel()
    return bool(np.bincount(q, minlength=16).max() / q.size > 0.55)


def copy_move(bgr: np.ndarray) -> dict:
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if _is_text_document(gray):
        return {
            "suspicious": False,
            "matches": 0,
            "applicable": False,
            "note": "документ/скриншот с однородным фоном — copy-move не применяется (повторы букв дают ложные срабатывания)",
        }
    h, w = gray.shape
    s = 1200 / max(h, w)
    if s < 1:
        gray = cv2.resize(gray, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    kp, des = cv2.SIFT_create(nfeatures=4000).detectAndCompute(gray, None)
    if des is None or len(kp) < 50:
        return {"suspicious": False, "matches": 0, "applicable": True}
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(des, des, k=3)
    offsets = []
    for p in pairs:
        cand = [m for m in p if m.queryIdx != m.trainIdx and m.distance > 1e-6]
        if len(cand) < 2 or cand[0].distance > 0.5 * cand[1].distance:
            continue
        d = np.array(kp[cand[0].trainIdx].pt) - np.array(kp[cand[0].queryIdx].pt)
        if np.hypot(*d) < 0.08 * max(gray.shape):
            continue
        offsets.append(d)
    if len(offsets) < 8:
        return {"suspicious": False, "matches": len(offsets), "applicable": True}
    bins = np.round(np.array(offsets) / 6).astype(int)
    _, counts = np.unique(bins, axis=0, return_counts=True)
    best = int(counts.max())
    return {"suspicious": best >= 8, "matches": best, "applicable": True}


def tamper_analysis(path: Path, bgr: np.ndarray, ela_png: Path | None, vlm_anomalies: list[str]) -> dict:
    signals, meta = exif_signals(path)
    ela = ela_analysis(path, ela_png)
    if ela.get("anomaly"):
        signals.append(
            {
                "name": "ela",
                "weight": 2,
                "text": f"ELA: отдельные участки сжаты иначе, чем остальное изображение (ratio={ela['ratio']}) — возможна вставка/правка",
            }
        )
    noise = noise_analysis(bgr)
    if noise.get("anomaly"):
        signals.append(
            {"name": "noise", "weight": 2, "text": "Неоднородный уровень шума: часть изображения отличается по шумовой структуре"}
        )
    cm = copy_move(bgr)
    if cm.get("suspicious"):
        signals.append(
            {
                "name": "copy_move",
                "weight": 3,
                "text": f"Найдены совпадающие участки с одинаковым смещением ({cm['matches']} точек) — возможно клонирование",
            }
        )
    for a in vlm_anomalies[:5]:
        signals.append({"name": "vision", "weight": 1, "text": f"Vision-модель отметила: {a}"})
    score = sum(s["weight"] for s in signals)
    risk = "high" if score >= 4 else ("medium" if score >= 2 else "low")
    return {
        "risk": risk,
        "score": score,
        "signals": signals,
        "exif": meta,
        "ela": ela,
        "noise": noise,
        "copy_move": cm,
        "disclaimer": "Эвристическая оценка. Не является доказательством подделки; при medium/high требуется проверка человеком.",
    }
