import os
import re
import tempfile
from pathlib import Path

_TMP = tempfile.mkdtemp(prefix="kpi-tests-")
os.environ["DATA_DIR"] = _TMP
os.environ["LLM_CACHE"] = "0"

import openpyxl
import pytest

from app import llm

SAMPLES = Path(__file__).parent.parent / "samples"


def mini_entry() -> dict:
    return {
        "key": "P1",
        "name": "Профессор",
        "aliases": ["Профессор"],
        "scope": "основной",
        "weight_sum": 100.0,
        "blocks": [
            {
                "id": "P1-B1",
                "title": "Научная работа",
                "mode": "any_of",
                "mode_text": "Один из следующих показателей",
                "weight": 60.0,
                "target": {"raw": "1", "kind": "count", "value": 1.0},
                "kind": "count",
                "items": [
                    {"id": "P1-B1-I1", "num": "1", "text": "Статья в журнале Q1/Q2, статус Accepted, аффилиация AITU"},
                    {"id": "P1-B1-I2", "num": "2", "text": "Выступление на 2 (два) международных конференциях"},
                ],
            },
            {
                "id": "P1-B2",
                "title": "Качество преподавания",
                "mode": "average",
                "mode_text": "Среднее значение",
                "weight": 40.0,
                "target": {"raw": "80%", "kind": "percent", "value": 80.0},
                "kind": "metric",
                "items": [
                    {"id": "P1-B2-I1", "num": "1", "text": "Результат анкетирования студентов"},
                    {"id": "P1-B2-I2", "num": "2", "text": "Оценка руководства"},
                ],
            },
        ],
    }


def mini_catalog() -> dict:
    return {"id": "t", "name": "t", "positions": [mini_entry()]}


def make_catalog_xlsx(path: Path) -> Path:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Должность", "Вид деятельности", "Вес (%)", "Целевое значение"])
    ws.append(
        [
            "1. Профессор",
            "Блок 1: Научная работа\nОдин из следующих показателей:\n1. Статья в журнале Q1/Q2, статус Accepted, аффилиация AITU\n"
            "2. Выступление на 2 (два) международных конференциях",
            "60",
            "1",
        ]
    )
    ws.append(
        [
            "",
            "Блок 2: Качество преподавания\nСреднее значение:\n1. Результат анкетирования студентов\n2. Оценка руководства",
            "40",
            "80%",
        ]
    )
    wb.save(path)
    return path


REPORT = """ФИО: Тестов Тест Тестович
Должность: Профессор
1.1. Статья «Alpha» принята в журнал Q1 по Scopus, аффилиация AITU, статус Accepted.
1.2. Выступил с докладом на конференции Beta.
Результат анкетирования студентов: 60%.
Оценка руководства: 91%.
"""


class FakeLLM:
    def __init__(self):
        self.achievements: list[dict] = []
        self.decisions = {}
        self.metrics: list[dict] = []
        self.position: dict = {"position": "НЕ УКАЗАНА", "quote": ""}
        self.link: dict = {"achievement_id": "NONE", "reasoning": "нет связи"}
        self.calls: list[str] = []

    def text_json(self, system, user, schema):
        props = schema["properties"]
        if "achievements" in props:
            self.calls.append("extract")
            return {"achievements": self.achievements}
        if "decisions" in props:
            self.calls.append("classify")
            out = []
            for a_id, quote in re.findall(r"^\[(A\d+)\] (.*)$", user, re.M):
                for frag, dec in self.decisions.items():
                    if frag in quote:
                        out.append({"achievement_id": a_id, **(dec(a_id, quote) if callable(dec) else dec)})
            return {"decisions": out}
        if "metrics" in props:
            self.calls.append("metrics")
            return {"metrics": self.metrics}
        if "position" in props:
            self.calls.append("position")
            return self.position
        self.calls.append("link")
        return self.link


def cond(text: str, supported: bool, evidence: str = "") -> dict:
    return {"condition": text, "supported": supported, "evidence": evidence}


@pytest.fixture
def fake_llm(monkeypatch):
    f = FakeLLM()
    monkeypatch.setattr(llm, "text_json", f.text_json)
    monkeypatch.setattr(llm, "model_digest", lambda m: "sha256:test")
    return f
