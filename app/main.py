from __future__ import annotations

import io
import json
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, config, llm, pipeline, prompts
from .catalog import build_catalog, public_catalog
from .docparse import parse_file


@asynccontextmanager
async def lifespan(_: FastAPI):
    pipeline.recover_interrupted()
    yield


app = FastAPI(title="Интеллектуальная система оценки KPI", version=__version__, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

_ROOT = Path(__file__).resolve().parent.parent
STATIC_CANDIDATES = [Path(__file__).parent / "static", _ROOT / "frontend" / "dist"]


def _static_dir() -> Path | None:
    return next((d for d in STATIC_CANDIDATES if (d / "index.html").exists()), None)


def _catalog_path(cid: str) -> Path:
    if not cid.isalnum():
        raise HTTPException(400, "Некорректный id")
    return config.CATALOG_DIR / f"{cid}.json"


def _load_catalog(cid: str) -> dict:
    p = _catalog_path(cid)
    if not p.exists():
        raise HTTPException(404, "Каталог KPI не найден")
    return json.loads(p.read_text(encoding="utf-8"))


async def _read_upload(f: UploadFile, allowed: set[str]) -> tuple[str, bytes]:
    name = Path(f.filename or "file").name
    ext = Path(name).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"{name}: формат {ext or '(без расширения)'} не поддерживается")
    data = await f.read()
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"{name}: файл больше {config.MAX_UPLOAD_MB} МБ")
    return name, data


@app.get("/api/health")
def health():
    return {
        **llm.health(),
        "version": __version__,
        "prompt_version": prompts.PROMPT_VERSION,
        "settings": {
            "temperature": config.TEMPERATURE,
            "top_k": config.TOP_K,
            "num_ctx": config.NUM_CTX,
            "think": config.THINK,
            "seed": config.SEED,
            "llm_cache": llm.cache_enabled(),
            "report_chunk_chars": config.report_chunk_chars(),
        },
    }


@app.get("/api/prompts")
def get_prompts():
    return {"version": prompts.PROMPT_VERSION, "prompts": prompts.all_prompts(), "modelfile": prompts.modelfile_text()}


@app.post("/api/catalogs")
async def create_catalog(files: list[UploadFile] = File(...), name: str = Form("")):
    docs = []
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            fname, data = await _read_upload(f, config.DOC_EXT)
            p = Path(tmp) / fname
            p.write_bytes(data)
            try:
                docs.append(parse_file(p))
            except Exception as e:
                raise HTTPException(400, f"{fname}: {e}") from e
    cat = public_catalog(build_catalog(docs, name.strip()))
    _catalog_path(cat["id"]).write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    return _summary(cat) | {"warnings": cat["warnings"]}


def _summary(cat: dict) -> dict:
    return {
        "id": cat["id"],
        "name": cat["name"],
        "files": cat["files"],
        "created_at": cat["created_at"],
        "positions_count": len(cat["positions"]),
        "indicators_count": sum(len(b["items"]) for p in cat["positions"] for b in p["blocks"]),
        "warnings_count": len(cat["warnings"]),
    }


@app.get("/api/catalogs")
def list_catalogs():
    out = [_summary(json.loads(p.read_text(encoding="utf-8"))) for p in config.CATALOG_DIR.glob("*.json")]
    return sorted(out, key=lambda c: c["created_at"], reverse=True)


@app.get("/api/catalogs/{cid}")
def get_catalog(cid: str):
    return _load_catalog(cid)


@app.delete("/api/catalogs/{cid}")
def delete_catalog(cid: str):
    _catalog_path(cid).unlink(missing_ok=True)
    return {"ok": True}


@app.post("/api/submissions")
async def create_submission(
    catalog_id: str = Form(...),
    files: list[UploadFile] = File(...),
    employee: str = Form(""),
    position_key: str = Form(""),
    scope_index: int = Form(0),
):
    cat = _load_catalog(catalog_id)
    if not files:
        raise HTTPException(400, "Загрузите хотя бы один файл")
    allowed = config.DOC_EXT | config.IMAGE_EXT
    payload = [await _read_upload(f, allowed) for f in files]
    state = pipeline.create_submission(catalog_id, payload, employee.strip(), position_key, scope_index)
    pipeline.start(state["id"], cat)
    return {"id": state["id"]}


@app.get("/api/submissions")
def list_submissions():
    out = []
    for d in config.SUBMISSION_DIR.iterdir():
        st = pipeline.load_state(d.name) if d.is_dir() else None
        if st:
            r = st.get("result") or {}
            out.append(
                {
                    "id": st["id"],
                    "created_at": st["created_at"],
                    "status": st["status"],
                    "files": st["files"],
                    "employee": r.get("employee") or st.get("employee"),
                    "position": (r.get("position") or {}).get("name"),
                    "kpi": r.get("kpi_total_pct"),
                }
            )
    return sorted(out, key=lambda s: s["created_at"], reverse=True)


@app.get("/api/submissions/{sid}")
def get_submission(sid: str):
    st = pipeline.load_state(sid) if sid.isalnum() else None
    if not st:
        raise HTTPException(404, "Не найдено")
    return st


@app.post("/api/submissions/{sid}/rerun")
def rerun(sid: str, position_key: str = Form(""), scope_index: int = Form(0)):
    st = pipeline.load_state(sid) if sid.isalnum() else None
    if not st:
        raise HTTPException(404, "Не найдено")
    if st["status"] in ("queued", "running"):
        raise HTTPException(409, "Оценка ещё выполняется")
    st.update(position_key=position_key, scope_index=scope_index, status="queued", result=None)
    pipeline.save_state(st)
    pipeline.start(sid, _load_catalog(st["catalog_id"]), reuse=True)
    return {"id": sid}


@app.get("/api/submissions/{sid}/files/{name}")
def submission_file(sid: str, name: str):
    base = pipeline.sub_dir(sid) if sid.isalnum() else None
    if base is None:
        raise HTTPException(404)
    for p in (base / name, base / "uploads" / name):
        if p.resolve().parent in (base.resolve(), (base / "uploads").resolve()) and p.is_file():
            return FileResponse(p)
    raise HTTPException(404)


@app.get("/api/submissions/{sid}/export.xlsx")
def export_xlsx(sid: str):
    st = pipeline.load_state(sid) if sid.isalnum() else None
    if not st or not st.get("result") or st["result"].get("status") != "done":
        raise HTTPException(404, "Результата нет")
    from .export import build_xlsx

    buf = io.BytesIO(build_xlsx(st))
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="kpi_{sid}.xlsx"'},
    )


@app.delete("/api/submissions/{sid}")
def delete_submission(sid: str):
    if sid.isalnum():
        shutil.rmtree(pipeline.sub_dir(sid), ignore_errors=True)
    return {"ok": True}


_static = _static_dir()
if _static:
    app.mount("/", StaticFiles(directory=_static, html=True), name="static")
else:

    @app.get("/", response_class=HTMLResponse)
    def no_frontend():
        return (
            "<h2>Интерфейс не собран</h2><p>API работает (<a href='/docs'>/docs</a>). Соберите фронтенд: "
            "<code>cd frontend && npm ci && npm run build</code> — или запустите <code>npm run dev</code>.</p>"
        )
