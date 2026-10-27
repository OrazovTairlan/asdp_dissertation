import pytest
from conftest import REPORT, cond, make_catalog_xlsx
from fastapi.testclient import TestClient

from app import chat, config, llm, pipeline
from app.main import app

client = TestClient(app)

ARTICLE = {
    "indicator_id": "P1-B1-I1",
    "required_count": 1,
    "conditions": [cond("Q1/Q2", True, "журнал Q1"), cond("Accepted", False, ""), cond("AITU", True, "аффилиация AITU")],
    "claim_quote": "Статья «Alpha» принята в журнал Q1",
    "argument": "Сотрудник заявляет: «Статья «Alpha» принята в журнал Q1». Статус не подтверждён.",
}
QUOTE = "Статья «Alpha» принята в журнал Q1 по Scopus, аффилиация AITU, статус Accepted."


@pytest.fixture
def evaluated(fake_llm, monkeypatch, tmp_path):
    monkeypatch.setattr(pipeline, "start", lambda sid, cat, reuse=False: pipeline.process(sid, cat, reuse))
    f = make_catalog_xlsx(tmp_path / "kpi.xlsx")
    cid = client.post("/api/catalogs", files=[("files", ("kpi.xlsx", f.read_bytes()))], data={"name": "T"}).json()["id"]
    fake_llm.achievements = [{"quote": QUOTE, "summary": ""}]
    fake_llm.decisions = {"Alpha": ARTICLE}
    sid = client.post("/api/submissions", data={"catalog_id": cid}, files=[("files", ("report.txt", REPORT.encode()))]).json()[
        "id"
    ]
    assert client.get(f"/api/submissions/{sid}").json()["status"] == "done"
    return sid


@pytest.fixture
def model(monkeypatch):
    calls = []

    def fake(system, history, user, think=None):
        calls.append({"system": system, "history": history, "user": user, "think": think})
        return (
            "Ответ: статья не засчитана, потому что статус не подтверждён.\n"
            "Основание:\n- в отчёте: «Статья «Alpha» принята в журнал Q1 по Scopus»\n"
            "- выдуманная цитата: «статья опубликована в Nature в 2024 году»"
        )

    monkeypatch.setattr(llm, "text_chat", fake)
    return calls


def test_quotes_in_keeps_nested_guillemets():
    text = "Сотрудник заявляет: «Статья «Alpha» принята в журнал Q1». Коротко: «Q1». Ещё «аффилиация AITU указана»."
    assert chat.quotes_in(text) == ["Статья «Alpha» принята в журнал Q1", "аффилиация AITU указана"]


def test_verify_quotes_marks_invented_text_and_accepts_ellipsis():
    pieces = [chat.norm(REPORT)]
    res = chat.verify_quotes("«Статья «Alpha» принята … статус Accepted» и «получил Нобелевскую премию по физике»", pieces)
    assert [c["found"] for c in res] == [True, False]


def test_context_contains_conditions_trace_and_todo(evaluated):
    r = client.get(f"/api/submissions/{evaluated}").json()["result"]
    ctx = chat.build_context(r)
    assert "РЕШЕНИЕ [A1 → показатель 1]: не засчитано" in ctx
    assert "✗ Accepted" in ctx and "✓ Q1/Q2 | отчёт: «журнал Q1»" in ctx
    assert "Протокол — Итог: Не засчитано" in ctx and "Что нужно для зачёта: Явно указать в документах: Accepted" in ctx
    assert "Показатели без заявлений в документах: 2)" in ctx
    assert "Итоговый KPI (предварительный)" in ctx


def test_chat_round_trip_with_history_focus_and_citations(evaluated, model):
    assert client.get(f"/api/submissions/{evaluated}/chat").json()["messages"] == []
    r = client.post(
        f"/api/submissions/{evaluated}/chat",
        json={"message": "Почему статья не засчитана?", "focus": {"achievement_id": "A1", "indicator_id": "P1-B1-I1"}},
    )
    assert r.status_code == 200, r.text
    msgs = r.json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant"]
    assert msgs[0]["focus"] == {"achievement_id": "A1", "indicator_id": "P1-B1-I1"}
    cites = {c["text"]: c["found"] for c in msgs[1]["citations"]}
    assert cites == {"Статья «Alpha» принята в журнал Q1 по Scopus": True, "статья опубликована в Nature в 2024 году": False}
    first = model[0]
    assert "МАТЕРИАЛЫ ОЦЕНКИ" in first["system"] and "ДОКУМЕНТЫ СОТРУДНИКА" in first["system"] and QUOTE in first["system"]
    assert first["user"].startswith("ВОПРОС ОТНОСИТСЯ К РЕШЕНИЮ [A1 → показатель 1]") and first["history"] == []
    assert first["think"] == config.THINK_CHAT

    client.post(f"/api/submissions/{evaluated}/chat", json={"message": "А что добавить в отчёт?"})
    assert [m["role"] for m in model[1]["history"]] == ["user", "assistant"]
    assert model[1]["user"] == "ВОПРОС ПРОВЕРЯЮЩЕГО: А что добавить в отчёт?"
    assert len(client.get(f"/api/submissions/{evaluated}/chat").json()["messages"]) == 4

    assert client.delete(f"/api/submissions/{evaluated}/chat").json() == {"messages": []}
    client.post(f"/api/submissions/{evaluated}/chat", json={"message": "Ещё вопрос"})
    assert client.post(f"/api/submissions/{evaluated}/rerun", data={"position_key": "P1"}).status_code == 200
    assert client.get(f"/api/submissions/{evaluated}/chat").json()["messages"] == []


def test_chat_validation_and_errors(evaluated, monkeypatch):
    assert client.post(f"/api/submissions/{evaluated}/chat", json={"message": ""}).status_code == 422
    assert client.post(f"/api/submissions/{evaluated}/chat", json={"message": "x" * 2001}).status_code == 422
    assert client.post("/api/submissions/nope/chat", json={"message": "?"}).status_code == 404

    def down(*a, **k):
        raise llm.LLMError("Ollama недоступен")

    monkeypatch.setattr(llm, "text_chat", down)
    r = client.post(f"/api/submissions/{evaluated}/chat", json={"message": "Почему?"})
    assert r.status_code == 503 and "Ollama" in r.json()["detail"]
    assert client.get(f"/api/submissions/{evaluated}/chat").json()["messages"] == []

    st = pipeline.load_state(evaluated)
    st["status"] = "running"
    pipeline.save_state(st)
    assert client.post(f"/api/submissions/{evaluated}/chat", json={"message": "Почему?"}).status_code == 409


def test_text_chat_sends_history_and_caches(monkeypatch):
    sent = []

    def fake_chat(model, system, user, *, history=None, think=None, **k):
        sent.append({"history": history, "user": user, "think": think})
        return "  Ответ: да.  "

    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setattr(config, "LLM_CACHE", True)
    h = [{"role": "user", "content": "q1"}, {"role": "assistant", "content": "a1"}]
    assert llm.text_chat("sys", h, "q2", think="medium") == "Ответ: да."
    assert llm.text_chat("sys", h, "q2", think="medium") == "Ответ: да."
    assert len(sent) == 1 and sent[0]["history"] == h and sent[0]["think"] == "medium"
    monkeypatch.setattr(llm, "chat", lambda *a, **k: "   ")
    with pytest.raises(llm.LLMError):
        llm.text_chat("sys", [], "другой вопрос")


def test_quote_check_ignores_dash_variants():
    pieces = [chat.norm("Программа отклонила ответы модели: цитата-подтверждение отсутствует")]
    assert chat.verify_quotes("«цитата‑подтверждение отсутствует»", pieces) == [
        {"text": "цитата‑подтверждение отсутствует", "found": True}
    ]
