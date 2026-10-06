## What changed

## How it was tested
- [ ] `ruff check . && ruff format --check .`
- [ ] `pytest` (backend)
- [ ] `npm test && npm run lint && npm run build` in `frontend/` (if touched)

## Checklist
- [ ] No behaviour change in KPI calculation, **or** the change is described and covered by a test
- [ ] Prompts changed? → `PROMPT_VERSION` bumped in `app/prompts.py` and `docs/PROMPTS.md` updated
- [ ] README / docs updated if needed
