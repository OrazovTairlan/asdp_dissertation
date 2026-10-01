import os
from pathlib import Path


def _flag(name: str, default: bool) -> bool:
    return os.getenv(name, "1" if default else "0").strip().lower() in ("1", "true", "yes", "on")


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")

TEXT_MODEL = os.getenv("TEXT_MODEL", "gpt-oss:20b")
VISION_MODEL = os.getenv("VISION_MODEL", "qwen2.5vl:7b")

TEMPERATURE = float(os.getenv("TEMPERATURE", "0"))
TOP_K = int(os.getenv("TOP_K", "1"))
REPEAT_PENALTY = float(os.getenv("REPEAT_PENALTY", "1.0"))
SEED = int(os.getenv("SEED", "42"))

LLM_CACHE = _flag("LLM_CACHE", True)

NUM_CTX = int(os.getenv("NUM_CTX", "16384"))
VISION_NUM_CTX = int(os.getenv("VISION_NUM_CTX", "8192"))
NUM_PREDICT = int(os.getenv("NUM_PREDICT", "4096"))
THINK = os.getenv("THINK", "low")

REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT", "1800"))

CHARS_PER_TOKEN = float(os.getenv("CHARS_PER_TOKEN", "2.2"))
PROMPT_RESERVE_TOKENS = int(os.getenv("PROMPT_RESERVE_TOKENS", "6500"))

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
DOC_EXT = {".pdf", ".docx", ".txt", ".md", ".xlsx", ".xlsm", ".csv"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}

CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()
]

DATA_DIR = Path(os.getenv("DATA_DIR", "data")).resolve()
CATALOG_DIR = DATA_DIR / "catalogs"
SUBMISSION_DIR = DATA_DIR / "submissions"
LLM_CACHE_DIR = DATA_DIR / "llm_cache"

for _d in (CATALOG_DIR, SUBMISSION_DIR, LLM_CACHE_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def report_chunk_chars() -> int:
    return max(4000, int((NUM_CTX - PROMPT_RESERVE_TOKENS) * CHARS_PER_TOKEN))
