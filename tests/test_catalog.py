from pathlib import Path

import pytest

from app import evaluate
from app.catalog import build_catalog
from app.docparse import join_wrapped, parse_file

SAMPLE = Path(__file__).parent.parent / "samples" / "kpi_polozhenie.pdf"


@pytest.fixture(scope="module")
def cat():
    return build_catalog([parse_file(SAMPLE)])


def test_all_weights_sum_to_100(cat):
    assert cat["warnings"] == []
    assert len(cat["positions"]) == 16
    assert all(abs(p["weight_sum"] - 100) < 1e-9 for p in cat["positions"])


def test_indicator_counts_match_document(cat):
    def blocks(name, scope_word):
        p = next(p for p in cat["positions"] if p["name"] == name and scope_word in p["scope"])
        return [(b["weight"], len(b["items"]), b["target"]["value"]) for b in p["blocks"]]

    assert blocks("Профессор", "до окончания") == [(50.0, 11, 1.0), (25.0, 14, 2.0), (25.0, 2, 80.0)]
    assert blocks("Ассоциированный профессор", "до окончания") == [(50.0, 11, 1.0), (25.0, 15, 2.0), (25.0, 2, 80.0)]
    assert blocks("Сеньор - лектор", "после") == [(10.0, 5, 1.0), (30.0, 12, 2.0), (60.0, 2, 80.0)]


def test_scopes_distinguished(cat):
    scopes = {p["scope"][:60] for p in cat["positions"]}
    assert len(scopes) == 2
    assert any("до окончания" in s for s in scopes) and any("после" in s for s in scopes)


def test_indicator_text_is_complete(cat):
    p = next(p for p in cat["positions"] if p["name"] == "Профессор")
    ind = p["blocks"][0]["items"][0]
    assert "Q1/Q2/Q3" in ind["text"] and "Accepted" in ind["text"]
    mono = p["blocks"][0]["items"][4]["text"]
    assert mono.startswith("Монография") and "МНВО РК" in mono[-30:]


def test_alias_split(cat):
    p = next(p for p in cat["positions"] if p["name"].startswith("Преподаватель физкультуры"))
    assert "Старший преподаватель физкультуры" in p["aliases"]


def test_position_from_report_field(cat):
    r = evaluate.resolve_position(cat, "ФИО: Иванов И.И.\nДолжность: Ассоциированный профессор\nтекст")
    assert r["name"] == "Ассоциированный профессор"
    r = evaluate.resolve_position(cat, "Должность: профессор\n")
    assert r["name"] == "Профессор" and len(r["entries"]) == 2


def test_join_wrapped():
    assert (
        join_wrapped("Блок 1: Науч-\nно\nОдин из следующих:\n1. Первый\nпродолжение\n2. Второй")
        == "Блок 1: Науч-но\nОдин из следующих:\n1. Первый продолжение\n2. Второй"
    )


def test_quote_verification():
    seg = evaluate.prepare_segments(
        [{"label": "r", "text": "Статья опубликована в журнале Q1,  статус «Accepted».", "image_id": None}]
    )
    assert evaluate.locate_quote('опубликована в журнале Q1, статус "Accepted"', seg)
    assert evaluate.locate_quote("статья опубликована в журнале Nature", seg) is None


def test_chunking_keeps_all_text():
    segs = [{"label": "a", "text": "\n".join(f"строка {i} " + "x" * 50 for i in range(200)), "image_id": None}]
    chunks = evaluate.make_chunks(segs, 3000)
    assert len(chunks) > 1 and all(len(c) < 3200 for c in chunks)
    joined = "".join(chunks)
    assert all(f"строка {i} " in joined for i in range(200))
