import base64
import hashlib
import json
import re

import httpx

from . import config, prompts


class LLMError(RuntimeError):
    pass


def _client() -> httpx.Client:
    return httpx.Client(base_url=config.OLLAMA_URL, timeout=httpx.Timeout(config.REQUEST_TIMEOUT, connect=10))


def health() -> dict:
    out = {
        "ollama_url": config.OLLAMA_URL,
        "reachable": False,
        "installed": [],
        "text_model": config.TEXT_MODEL,
        "vision_model": config.VISION_MODEL,
        "text_model_ok": False,
        "vision_model_ok": False,
    }
    try:
        with _client() as c:
            r = c.get("/api/tags", timeout=5)
            r.raise_for_status()
        names = [m["name"] for m in r.json().get("models", [])]
        out.update(reachable=True, installed=names)

        def has(model: str) -> bool:
            return model in names or (":" not in model and f"{model}:latest" in names)

        out["text_model_ok"] = has(config.TEXT_MODEL)
        out["vision_model_ok"] = has(config.VISION_MODEL)
    except Exception as e:
        out["error"] = str(e)
    return out


def model_digest(model: str) -> str | None:
    try:
        with _client() as c:
            r = c.get("/api/tags", timeout=5)
            r.raise_for_status()
        for m in r.json().get("models", []):
            if m.get("name") in (model, f"{model}:latest"):
                return m.get("digest")
    except Exception:
        pass
    return None


def run_info() -> dict:
    return {
        "prompt_version": prompts.PROMPT_VERSION,
        "text_model": config.TEXT_MODEL,
        "text_model_digest": model_digest(config.TEXT_MODEL),
        "vision_model": config.VISION_MODEL,
        "temperature": config.TEMPERATURE,
        "top_k": config.TOP_K,
        "seed": config.SEED,
        "num_ctx": config.NUM_CTX,
        "think": config.THINK or None,
        "cache": cache_enabled(),
    }


def cache_enabled() -> bool:
    return config.LLM_CACHE and config.TEMPERATURE == 0


def cache_key(
    model: str, system: str, user: str, schema: dict | None, images: list[bytes] | None, num_ctx: int, think: str | None
) -> str:
    h = hashlib.sha256()
    parts = [
        model,
        system,
        user,
        json.dumps(schema, sort_keys=True, ensure_ascii=False) if schema else "",
        str(num_ctx),
        think or "",
        f"t={config.TEMPERATURE};k={config.TOP_K};s={config.SEED};rp={config.REPEAT_PENALTY};np={config.NUM_PREDICT}",
        *[hashlib.sha256(i).hexdigest() for i in (images or [])],
    ]
    for p in parts:
        h.update(p.encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def _cache_get(key: str) -> dict | None:
    f = config.LLM_CACHE_DIR / f"{key}.json"
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    except (OSError, json.JSONDecodeError):
        return None


def _cache_put(key: str, value: dict) -> None:
    f = config.LLM_CACHE_DIR / f"{key}.json"
    tmp = f.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        tmp.replace(f)
    except OSError:
        pass


def chat(
    model: str,
    system: str,
    user: str,
    *,
    schema: dict | None = None,
    images: list[bytes] | None = None,
    num_ctx: int | None = None,
    think: str | None = None,
) -> str:
    msg_user: dict = {"role": "user", "content": user}
    if images:
        msg_user["images"] = [base64.b64encode(i).decode() for i in images]
    payload: dict = {
        "model": model,
        "stream": False,
        "messages": [{"role": "system", "content": system}, msg_user],
        "options": {
            "temperature": config.TEMPERATURE,
            "top_k": config.TOP_K,
            "top_p": 1.0,
            "repeat_penalty": config.REPEAT_PENALTY,
            "seed": config.SEED,
            "num_ctx": num_ctx or config.NUM_CTX,
            "num_predict": config.NUM_PREDICT,
        },
    }
    if schema is not None:
        payload["format"] = schema
    if think:
        payload["think"] = think
    try:
        with _client() as c:
            r = c.post("/api/chat", json=payload)
    except httpx.HTTPError as e:
        raise LLMError(f"Ollama недоступен ({config.OLLAMA_URL}): {e}") from e
    if r.status_code != 200:
        raise LLMError(f"Ollama вернул {r.status_code}: {r.text[:500]}")
    return r.json().get("message", {}).get("content", "")


def _parse_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def chat_json(
    model: str,
    system: str,
    user: str,
    schema: dict,
    *,
    images: list[bytes] | None = None,
    num_ctx: int | None = None,
    think: str | None = None,
    retries: int = 1,
) -> dict:
    ctx = num_ctx or config.NUM_CTX
    key = cache_key(model, system, user, schema, images, ctx, think) if cache_enabled() else None
    if key and (hit := _cache_get(key)) is not None:
        return hit
    last = ""
    for _ in range(retries + 1):
        last = chat(model, system, user, schema=schema, images=images, num_ctx=num_ctx, think=think)
        parsed = _parse_json(last)
        if parsed is not None:
            if key:
                _cache_put(key, parsed)
            return parsed
    raise LLMError(f"Модель вернула невалидный JSON: {last[:300]!r}")


def text_json(system: str, user: str, schema: dict) -> dict:
    return chat_json(config.TEXT_MODEL, system, user, schema, think=config.THINK or None)
