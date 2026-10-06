#!/usr/bin/env python3
"""Создаёт серию коммитов с нужными датами.

Запуск из корня проекта:
    python make_commits.py --dry-run   # только показать план
    python make_commits.py             # сделать коммиты

Даты:
  1 октября - основной (core) код: backend + frontend
  5 октября - вчера: тесты, docker, базовый CI, примеры
  6 октября - сегодня: остальной CI, шаблоны GitHub, документация
"""
import argparse
import os
import subprocess
import sys
from datetime import datetime

DAY_CORE = "2026-10-01"
DAY_YESTERDAY = "2026-10-05"
DAY_TODAY = "2026-10-06"

# (дата, время, сообщение, [пути])
COMMITS = [
    # ================= 1 октября: core =================
    (DAY_CORE, "09:30", "chore: initialize project skeleton",
     [".gitignore", ".gitattributes", "pyproject.toml",
      "requirements.txt", ".env.example"]),
    (DAY_CORE, "10:10", "feat(core): add package init and configuration",
     ["app/__init__.py", "app/config.py"]),
    (DAY_CORE, "10:55", "feat(core): add prompt templates",
     ["app/prompts.py"]),
    (DAY_CORE, "11:40", "feat(llm): add LLM client with response cache",
     ["app/llm.py"]),
    (DAY_CORE, "12:15", "feat(llm): add Modelfile for KPI model",
     ["modelfiles"]),
    (DAY_CORE, "13:30", "feat(docs): add document parsing",
     ["app/docparse.py"]),
    (DAY_CORE, "14:20", "feat(catalog): add KPI catalog management",
     ["app/catalog.py"]),
    (DAY_CORE, "15:05", "feat(cv): add image processing utilities",
     ["app/imaging.py"]),
    (DAY_CORE, "15:50", "feat(cv): add vision checks for certificates",
     ["app/vision.py"]),
    (DAY_CORE, "16:40", "feat(evaluate): add KPI evaluation logic",
     ["app/evaluate.py"]),
    (DAY_CORE, "17:20", "feat(pipeline): add submission processing pipeline",
     ["app/pipeline.py"]),
    (DAY_CORE, "18:00", "feat(export): add report export",
     ["app/export.py"]),
    (DAY_CORE, "18:40", "feat(api): add FastAPI application",
     ["app/main.py", "app/static"]),
    (DAY_CORE, "19:15", "feat(cli): add command line interface",
     ["app/cli.py"]),
    (DAY_CORE, "20:00", "feat(frontend): bootstrap React app with Vite",
     ["frontend/package.json", "frontend/package-lock.json",
      "frontend/vite.config.js", "frontend/eslint.config.js",
      "frontend/index.html", "frontend/public", "frontend/src/main.jsx"]),
    (DAY_CORE, "20:30", "feat(frontend): add theme, api client and hooks",
     ["frontend/src/theme", "frontend/src/api.js", "frontend/src/hooks",
      "frontend/src/utils"]),
    (DAY_CORE, "21:00", "feat(frontend): add shared components",
     ["frontend/src/components"]),
    (DAY_CORE, "21:30", "feat(frontend): add pages and app shell",
     ["frontend/src/pages", "frontend/src/App.jsx"]),

    # ================= 5 октября (вчера) =================
    (DAY_YESTERDAY, "10:30", "chore: add LICENSE",
     ["LICENSE"]),
    (DAY_YESTERDAY, "11:15", "chore: add sample documents and images",
     ["samples"]),
    (DAY_YESTERDAY, "12:30", "test: add backend test suite",
     ["tests", "requirements-dev.txt"]),
    (DAY_YESTERDAY, "14:00", "test(frontend): add frontend unit tests",
     ["frontend/src/api.test.js", "frontend/src/App.test.jsx",
      "frontend/src/test"]),
    (DAY_YESTERDAY, "15:30", "build: add Dockerfile and docker-compose",
     ["Dockerfile", ".dockerignore", "docker-compose.yml"]),
    (DAY_YESTERDAY, "16:15", "build: add GPU and Ollama compose overrides",
     ["docker-compose.gpu.yml", "docker-compose.ollama.yml"]),
    (DAY_YESTERDAY, "17:30", "ci: add main CI workflow",
     [".github/workflows/ci.yml"]),
    (DAY_YESTERDAY, "18:10", "chore: configure dependabot",
     [".github/dependabot.yml"]),

    # ================= 6 октября (сегодня) =================
    (DAY_TODAY, "08:20", "ci: add CodeQL analysis workflow",
     [".github/workflows/codeql.yml"]),
    (DAY_TODAY, "08:40", "ci: add release workflow",
     [".github/workflows/release.yml"]),
    (DAY_TODAY, "08:55", "chore(github): add issue templates",
     [".github/ISSUE_TEMPLATE"]),
    (DAY_TODAY, "09:05", "chore(github): add pull request template",
     [".github/pull_request_template.md"]),
    (DAY_TODAY, "09:20", "docs: add prompts documentation and screenshots",
     ["docs"]),
    (DAY_TODAY, "09:35", "docs: add README (en/ru)",
     ["README.md", "README.ru.md"]),
    (DAY_TODAY, "09:45", "docs: add assignment presentation",
     ["Assignment3_Presentation.pptx"]),
    (DAY_TODAY, "09:55", "chore: add usage example script",
     ["example.py"]),
]

CATCH_ALL = (DAY_TODAY, "10:05", "chore: add remaining project files")
CATCH_ALL_EXCLUDE = ["data", "files.txt", ".venv", "frontend/node_modules"]


def run(cmd, env=None, check=True):
    return subprocess.run(cmd, env=env, check=check,
                          capture_output=True, text=True)


def make_date(day, hm):
    dt = datetime.strptime(f"{day} {hm}", "%Y-%m-%d %H:%M")
    now = datetime.now()
    if dt > now:  # не создаём коммиты из будущего
        dt = now.replace(microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def has_staged():
    return run(["git", "diff", "--cached", "--quiet"], check=False).returncode == 1


def do_commit(day, hm, message, paths, dry, catch_all=False):
    date_str = make_date(day, hm)

    if catch_all:
        targets = ["."] + [f":(exclude){p}" for p in CATCH_ALL_EXCLUDE]
    else:
        targets = [p for p in paths if os.path.exists(p)]
        for p in paths:
            if not os.path.exists(p):
                print(f"   ! пропущен (нет такого пути): {p}")
        if not targets:
            print(f"-- пропуск «{message}»: нет файлов")
            return

    if dry:
        print(f"[dry] {date_str}  {message}")
        for t in targets:
            print(f"        + {t}")
        return

    if catch_all:
        r = run(["git", "add", "--"] + targets, check=False)
        if r.returncode != 0:
            print(f"   ! git add: {r.stderr.strip()}")
    else:
        for p in targets:
            r = run(["git", "add", "--", p], check=False)
            if r.returncode != 0:
                print(f"   ! git add {p}: {r.stderr.strip()}")

    if not has_staged():
        print(f"-- пропуск «{message}»: нечего коммитить")
        return

    env = os.environ.copy()
    env["GIT_AUTHOR_DATE"] = date_str
    env["GIT_COMMITTER_DATE"] = date_str
    run(["git", "commit", "-m", message], env=env)
    print(f"ok {date_str}  {message}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="только показать план")
    ap.add_argument("--no-catch-all", action="store_true",
                    help="не делать финальный коммит со всем остальным")
    args = ap.parse_args()

    if run(["git", "rev-parse", "--is-inside-work-tree"], check=False).returncode != 0:
        print("Не git-репозиторий. Выполните сначала: git init")
        sys.exit(1)

    for day, hm, msg, paths in COMMITS:
        do_commit(day, hm, msg, paths, args.dry_run)

    if not args.no_catch_all:
        do_commit(*CATCH_ALL, [], args.dry_run, catch_all=True)

    print("\nГотово. Проверьте: git log --format='%h %ad %s' --date=iso")


if __name__ == "__main__":
    main()