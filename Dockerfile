# syntax=docker/dockerfile:1
# IDVS - Intelligent Document Verification System.
# Multi-stage build: (1) compile the React front end, (2) slim Python runtime with the API
# and the compiled UI. Tests are not part of this image; they run in ci/Dockerfile.test.

# ---- stage 1: build the React front end ----
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- stage 2: runtime image (FastAPI + compiled UI) ----
FROM python:3.12-slim

ARG GIT_COMMIT=unknown
LABEL org.opencontainers.image.title="IDVS - Intelligent Document Verification System" \
      org.opencontainers.image.source="https://github.com/OrazovTairlan/asdp_dissertation" \
      org.opencontainers.image.revision="${GIT_COMMIT}" \
      org.opencontainers.image.licenses="MIT"

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv

# dependencies first: this layer is reused while requirements.txt does not change
COPY requirements.txt .
RUN pip install -r requirements.txt

# the service does not need root: fixed uid, writable data directory
RUN useradd --system --uid 10001 --create-home idvs \
    && mkdir /data \
    && chown idvs:idvs /data

COPY app ./app
COPY --from=web /web/dist ./app/static

ENV DATA_DIR=/data
VOLUME /data
USER 10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request as u; u.urlopen('http://localhost:8000/api/health', timeout=4)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
