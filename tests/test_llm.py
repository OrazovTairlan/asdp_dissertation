import json

import httpx
import pytest

from app import config, llm

SCHEMA = {"type": "object", "properties": {"x": {"type": "integer"}}, "required": ["x"]}


@pytest.fixture
def ollama(monkeypatch):

    class Server:
        def __init__(self):
            self.requests: list[dict] = []
            self.content = '{"x": 1}'
            self.status = 200

        def handler(self, request: httpx.Request) -> httpx.Response:
            if request.url.path == "/api/tags":
                return httpx.Response(
                    200, json={"models": [{"name": "gpt-oss:20b", "digest": "abc123"}, {"name": "qwen2.5vl:7b", "digest": "d"}]}
                )
            self.requests.append(json.loads(request.content))
            if self.status != 200:
                return httpx.Response(self.status, text="boom")
            return httpx.Response(200, json={"message": {"content": self.content}})

    s = Server()
    monkeypatch.setattr(llm, "_client", lambda: httpx.Client(base_url="http://ollama", transport=httpx.MockTransport(s.handler)))
    return s


@pytest.fixture
def cache_on(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "LLM_CACHE", True)
    monkeypatch.setattr(config, "LLM_CACHE_DIR", tmp_path)
    return tmp_path


def test_request_uses_greedy_decoding_and_schema(ollama):
    llm.chat_json("m", "sys", "usr", SCHEMA, think="low")
    p = ollama.requests[0]
    assert p["options"]["temperature"] == 0 and p["options"]["top_k"] == 1 and p["options"]["top_p"] == 1.0
    assert p["options"]["seed"] == config.SEED
    assert p["format"] == SCHEMA and p["think"] == "low" and p["stream"] is False
    assert p["messages"][0] == {"role": "system", "content": "sys"}


def test_images_are_base64_encoded(ollama):
    llm.chat("vlm", "s", "u", images=[b"\x89PNG"])
    assert ollama.requests[0]["messages"][1]["images"] == ["iVBORw=="]


def test_cache_returns_same_answer_without_second_call(ollama, cache_on):
    assert llm.chat_json("m", "s", "u", SCHEMA) == {"x": 1}
    ollama.content = '{"x": 2}'
    assert llm.chat_json("m", "s", "u", SCHEMA) == {"x": 1}
    assert len(ollama.requests) == 1
    assert llm.chat_json("m", "s", "other input", SCHEMA) == {"x": 2}
    assert len(ollama.requests) == 2


def test_cache_key_depends_on_everything_that_affects_output():
    base = llm.cache_key("m", "s", "u", SCHEMA, None, 4096, "low")
    assert base == llm.cache_key("m", "s", "u", SCHEMA, None, 4096, "low")
    for other in (
        llm.cache_key("m2", "s", "u", SCHEMA, None, 4096, "low"),
        llm.cache_key("m", "s2", "u", SCHEMA, None, 4096, "low"),
        llm.cache_key("m", "s", "u2", SCHEMA, None, 4096, "low"),
        llm.cache_key("m", "s", "u", {**SCHEMA, "title": "t"}, None, 4096, "low"),
        llm.cache_key("m", "s", "u", SCHEMA, [b"img"], 4096, "low"),
        llm.cache_key("m", "s", "u", SCHEMA, None, 8192, "low"),
        llm.cache_key("m", "s", "u", SCHEMA, None, 4096, "high"),
    ):
        assert other != base


def test_cache_disabled_when_temperature_nonzero(ollama, cache_on, monkeypatch):
    monkeypatch.setattr(config, "TEMPERATURE", 0.7)
    assert not llm.cache_enabled()
    llm.chat_json("m", "s", "u", SCHEMA)
    llm.chat_json("m", "s", "u", SCHEMA)
    assert len(ollama.requests) == 2


def test_invalid_json_is_retried_then_fails(ollama):
    ollama.content = "not json at all"
    with pytest.raises(llm.LLMError, match="невалидный JSON"):
        llm.chat_json("m", "s", "u", SCHEMA, retries=1)
    assert len(ollama.requests) == 2


def test_json_embedded_in_text_is_recovered(ollama):
    ollama.content = 'Вот ответ: {"x": 5} — готово'
    assert llm.chat_json("m", "s", "u", SCHEMA) == {"x": 5}


def test_http_error_becomes_llmerror(ollama):
    ollama.status = 500
    with pytest.raises(llm.LLMError, match="500"):
        llm.chat("m", "s", "u")


def test_unreachable_ollama_becomes_llmerror(monkeypatch):
    def boom(_):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(llm, "_client", lambda: httpx.Client(base_url="http://x", transport=httpx.MockTransport(boom)))
    with pytest.raises(llm.LLMError, match="недоступен"):
        llm.chat("m", "s", "u")
    h = llm.health()
    assert h["reachable"] is False and "error" in h
    assert llm.model_digest("gpt-oss:20b") is None


def test_health_and_digest(ollama, monkeypatch):
    monkeypatch.setattr(config, "TEXT_MODEL", "gpt-oss:20b")
    monkeypatch.setattr(config, "VISION_MODEL", "missing-model")
    h = llm.health()
    assert h["reachable"] and h["text_model_ok"] and not h["vision_model_ok"]
    assert llm.model_digest("gpt-oss:20b") == "abc123"
    info = llm.run_info()
    assert info["text_model_digest"] == "abc123" and info["temperature"] == 0 and info["top_k"] == 1
    assert info["prompt_version"]
