from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import pipeline, prompts
from .catalog import build_catalog, public_catalog
from .docparse import parse_file


def _evaluate(args: argparse.Namespace) -> int:
    catalog = public_catalog(build_catalog([parse_file(Path(p)) for p in args.catalog]))
    for w in catalog["warnings"]:
        print(f"[каталог] {w}", file=sys.stderr)
    files = [(Path(p).name, Path(p).read_bytes()) for p in [*args.report, *args.image]]
    state = pipeline.create_submission("cli", files, args.employee or "", args.position or "", args.scope)
    pipeline.process(state["id"], catalog)
    state = pipeline.load_state(state["id"])
    for s in state["steps"]:
        print(f"{s['t']:>7}s  {s['msg']}", file=sys.stderr)
    if state["status"] != "done":
        print(f"Ошибка: {state.get('error')}", file=sys.stderr)
        return 1
    r = state["result"]
    if args.json:
        Path(args.json).write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    if r.get("status") != "done":
        print(f"Оценка не выполнена: {r.get('status')}; {'; '.join(r['warnings'])}")
        return 2
    print(f"\n{r['employee'] or 'Сотрудник'} — {r['position']['name']} ({r['position']['source']})")
    print(f"Карта KPI: {r['scope']['label']}\n")
    print(f"{'Блок':<60} {'Вес':>5} {'Исполн.':>8} {'Вклад':>7}")
    for b in r["blocks"]:
        print(f"{b['title'][:58]:<60} {b['weight']:>4}% {b['fulfillment']:>7}% {b['contribution']:>6}%")
    print(f"\nИТОГО: {r['kpi_total_pct']}%  (предварительно; решает Комиссия)")
    for w in r["warnings"]:
        print(f"  ! {w}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m app.cli", description="Оценка KPI без веб-интерфейса")
    sub = ap.add_subparsers(dest="cmd", required=True)
    ev = sub.add_parser("evaluate", help="оценить отчёт сотрудника по документу KPI")
    ev.add_argument("--catalog", nargs="+", required=True, help="документ(ы) организации с таблицами KPI")
    ev.add_argument("--report", nargs="+", default=[], help="отчёт(ы) сотрудника")
    ev.add_argument("--image", nargs="*", default=[], help="изображения-подтверждения")
    ev.add_argument("--employee", default="")
    ev.add_argument("--position", default="", help="ключ должности (P1…), если её нет в отчёте")
    ev.add_argument("--scope", type=int, default=0, help="индекс карты KPI, если у должности их несколько")
    ev.add_argument("--json", help="сохранить полное состояние оценки в JSON")
    sub.add_parser("prompts", help="вывести версию и тексты системных промптов")
    args = ap.parse_args(argv)
    if args.cmd == "prompts":
        print(f"PROMPT_VERSION = {prompts.PROMPT_VERSION}\n")
        for name, text in prompts.all_prompts().items():
            print(f"===== {name} =====\n{text}\n")
        return 0
    if not (args.report or args.image):
        ap.error("укажите --report и/или --image")
    return _evaluate(args)


if __name__ == "__main__":
    raise SystemExit(main())
