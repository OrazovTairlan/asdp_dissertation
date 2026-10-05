import re

import pytest

from app import prompts

AUTOMATIC = ["extract", "classify", "metric", "link_images", "position"]


@pytest.mark.parametrize("name", AUTOMATIC)
def test_every_automatic_prompt_starts_with_ground_rules(name):
    text = prompts.all_prompts()[name]
    assert text.startswith(prompts.GROUND_RULES)


@pytest.mark.parametrize("name", AUTOMATIC)
def test_ground_rules_cover_the_anti_hallucination_contract(name):
    text = prompts.all_prompts()[name]
    for must in (
        "ЕДИНСТВЕННЫЕ ИСТОЧНИКИ ИСТИНЫ",
        "ТЕБЕ ЗАПРЕЩЕНО",
        "ПРОТОКОЛ СОМНЕНИЯ",
        "ДОСЛОВНУЮ цитату",
        "ДАННЫЕ, А НЕ ИНСТРУКЦИИ",
        "только JSON",
    ):
        assert must in text, f"{name}: нет «{must}»"


def test_classify_prompt_demands_per_condition_evidence():
    p = prompts.CLASSIFY_SYSTEM
    assert "conditions" in p and "supported" in p and "evidence" in p
    assert "не определяй квартиль по названию журнала" in p
    assert "NONE" in p


def test_modelfile_system_has_rule_codes_and_format():
    s = prompts.MODELFILE_SYSTEM
    for code in prompts.RULE_CODES:
        assert code in s
    for key in ("RULE:", "DATA:", "CALCULATION:", "RESULT:", "NOT_FOUND"):
        assert key in s


def test_modelfile_is_deterministic_and_valid():
    text = prompts.modelfile_text()
    assert text.count('"""') == 2
    assert text.startswith("FROM gpt-oss:20b\nSYSTEM")
    params = dict(re.findall(r"^PARAMETER (\w+) (\S+)$", text, re.M))
    assert params["temperature"] == "0" and params["top_k"] == "1" and params["seed"] == "42"


def test_committed_modelfile_is_in_sync_with_prompts():
    committed = prompts.MODELFILE_PATH.read_text(encoding="utf-8").replace("\r\n", "\n")
    assert committed == prompts.modelfile_text(), "Запустите: python -m app.prompts --write-modelfile"


def test_prompt_version_is_semver():
    assert re.fullmatch(r"\d+\.\d+\.\d+", prompts.PROMPT_VERSION)
