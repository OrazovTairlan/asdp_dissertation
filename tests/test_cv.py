from pathlib import Path

import numpy as np
import pytest
from conftest import SAMPLES
from PIL import Image

from app import imaging, llm, vision

IMG = SAMPLES / "images"


def _bgr(p: Path):
    return imaging._to_bgr(p.read_bytes())


def test_integrity_ok_and_truncated():
    ok = imaging.check_integrity(IMG / "certificate_sharp.jpg")
    assert ok["status"] == "ok" and ok["format"] == "JPEG"
    bad = imaging.check_integrity(IMG / "certificate_truncated.jpg")
    assert bad["status"] == "corrupt" and bad["problems"]


def test_integrity_tiny_and_garbage_files(tmp_path):
    tiny = tmp_path / "t.jpg"
    tiny.write_bytes(b"x" * 10)
    assert imaging.check_integrity(tiny)["status"] == "corrupt"
    junk = tmp_path / "j.png"
    junk.write_bytes(b"not an image " * 50)
    assert imaging.check_integrity(junk)["status"] == "corrupt"


def test_integrity_extension_mismatch(tmp_path):
    p = tmp_path / "fake.png"
    Image.fromarray(np.random.default_rng(0).integers(0, 255, (400, 400, 3), dtype=np.uint8)).save(p, "JPEG")
    res = imaging.check_integrity(p)
    assert any("не соответствует" in x for x in res["problems"])


def test_blur_sharp_vs_blurred():
    assert imaging.blur_analysis(_bgr(IMG / "certificate_sharp.jpg"))["label"] == "sharp"
    assert imaging.blur_analysis(_bgr(IMG / "certificate_blurred.jpg"))["label"] == "blurred"


def test_blur_unknown_for_empty_image():
    blank = np.full((600, 800, 3), 255, dtype=np.uint8)
    assert imaging.blur_analysis(blank)["label"] == "unknown"


def test_tamper_editor_in_exif_is_flagged(tmp_path):
    t = imaging.tamper_analysis(IMG / "certificate_edited.jpg", _bgr(IMG / "certificate_edited.jpg"), tmp_path / "ela.png", [])
    assert t["risk"] in ("medium", "high")
    assert any("Photoshop" in s["text"] for s in t["signals"])
    assert t["disclaimer"]


def test_tamper_clean_image_low_risk(tmp_path):
    t = imaging.tamper_analysis(IMG / "certificate_sharp.jpg", _bgr(IMG / "certificate_sharp.jpg"), tmp_path / "ela.png", [])
    assert t["risk"] == "low"


@pytest.fixture
def fake_vlm(monkeypatch):
    out = {
        "description": "Сертификат",
        "document_type": "certificate",
        "extracted_text": "СЕРТИФИКАТ 62 часа",
        "people": [],
        "organizations": [],
        "dates": [],
        "visual_anomalies": [],
    }
    monkeypatch.setattr(llm, "chat_json", lambda *a, **k: out)
    return out


def test_analyze_good_image(tmp_path, fake_vlm):
    r = vision.analyze(IMG / "certificate_sharp.jpg", tmp_path, "img1")
    assert r["verdict"]["level"] in ("ok", "warn") and r["vision"]["document_type"] == "certificate" and r["errors"] == []


def test_analyze_corrupt_image_skips_everything_else(tmp_path, fake_vlm):
    r = vision.analyze(IMG / "certificate_truncated.jpg", tmp_path, "img2")
    assert r["verdict"] == {"usable": False, "level": "bad", "reasons": r["integrity"]["problems"]}
    assert "vision" not in r


def test_analyze_edited_image_is_not_ok(tmp_path, fake_vlm):
    r = vision.analyze(IMG / "certificate_edited.jpg", tmp_path, "img3")
    assert r["verdict"]["level"] in ("warn", "bad") and any("монтажа" in x for x in r["verdict"]["reasons"])


def test_analyze_blurred_image_warns(tmp_path, fake_vlm):
    r = vision.analyze(IMG / "certificate_blurred.jpg", tmp_path, "img4")
    assert r["verdict"]["level"] == "warn" and any("размыт" in x for x in r["verdict"]["reasons"])


def test_vision_model_unavailable_is_reported_not_raised(tmp_path, monkeypatch):
    def boom(*a, **k):
        raise llm.LLMError("нет модели")

    monkeypatch.setattr(llm, "chat_json", boom)
    r = vision.analyze(IMG / "certificate_sharp.jpg", tmp_path, "img5")
    assert r["vision"] is None and "недоступна" in r["errors"][0]
