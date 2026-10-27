import json

import httpx
import pytest

from app import config, publications

CROSSREF_OK = {
    "message": {
        "title": ["A Methodology for the Emulation of Architecture"],
        "author": [{"given": "Josiah", "family": "Carberry", "ORCID": "https://orcid.org/0000-0002-1825-0097"}],
        "container-title": ["Journal of Psychoceramics"],
        "type": "journal-article",
        "issued": {"date-parts": [[2012, 1, 16]]},
        "publisher": "Test accounts",
        "is-referenced-by-count": 3,
    }
}
CROSSREF_RETRACTED = {
    "message": {
        **CROSSREF_OK["message"],
        "title": ["Toward a Unified Theory of High-Energy Metaphysics"],
        "updated-by": [{"type": "retraction", "DOI": "10.5555/x"}],
    }
}
DATACITE_ARXIV = {
    "data": {
        "attributes": {
            "titles": [{"title": "Attention Is All You Need"}],
            "creators": [{"name": "Vaswani, Ashish", "givenName": "Ashish", "familyName": "Vaswani"}],
            "publicationYear": 2017,
            "publisher": "arXiv",
            "types": {"resourceTypeGeneral": "Preprint"},
        }
    }
}
OPENALEX_OK = {
    "is_retracted": False,
    "cited_by_count": 5,
    "primary_location": {"source": {"display_name": "Journal of Psychoceramics", "type": "journal"}},
    "authorships": [
        {
            "author": {"display_name": "Josiah Carberry", "orcid": "https://orcid.org/0000-0002-1825-0097"},
            "institutions": [{"display_name": "Brown University"}],
        }
    ],
    "open_access": {"is_oa": False},
}
ORCID_PERSON = {"name": {"given-names": {"value": "Josiah"}, "family-name": {"value": "Carberry"}}}
ORCID_WORKS = {
    "group": [
        {
            "work-summary": [
                {
                    "title": {"title": {"value": "A Methodology for the Emulation of Architecture"}},
                    "external-ids": {"external-id": [{"external-id-type": "doi", "external-id-value": "10.5555/12345680"}]},
                    "publication-date": {"year": {"value": "2012"}},
                }
            ]
        }
    ]
}


@pytest.fixture
def api(monkeypatch, tmp_path):
    routes: dict[str, tuple[int, object]] = {}
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        calls.append(url)
        for prefix, (status, body) in routes.items():
            if url.startswith(prefix):
                if isinstance(body, str):
                    return httpx.Response(status, text=body, headers={"content-type": "text/html"})
                return httpx.Response(status, json=body)
        return httpx.Response(404, json={})

    monkeypatch.setattr(config, "LOOKUP_CACHE_DIR", tmp_path)
    monkeypatch.setattr(publications, "_client", lambda contact=True: httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(publications, "_public_host", lambda host: host.endswith(".org") or host.endswith(".com"))
    routes["https://api.crossref.org/works/10.5555/12345680"] = (200, CROSSREF_OK)
    routes["https://api.crossref.org/works/10.5555/12345678"] = (200, CROSSREF_RETRACTED)
    routes["https://api.openalex.org/works/doi:10.5555/12345680"] = (200, OPENALEX_OK)
    routes["https://api.datacite.org/dois/10.48550/arxiv.1706.03762"] = (200, DATACITE_ARXIV)
    routes["https://pub.orcid.org/v3.0/0000-0002-1825-0097/person"] = (200, ORCID_PERSON)
    routes["https://pub.orcid.org/v3.0/0000-0002-1825-0097/works"] = (200, ORCID_WORKS)
    routes["https://example.org/cert/42"] = (200, "<html><title>Certificate &amp; verification</title></html>")
    routes["https://example.org/missing"] = (404, "<html><title>Not found</title></html>")

    class Api:
        pass

    a = Api()
    a.routes, a.calls = routes, calls
    return a


def test_find_identifiers():
    text = (
        "см. https://doi.org/10.1109/ACCESS.2020.3012345). ORCID: https://orcid.org/0000-0002-1825-0097, "
        "arXiv:2301.01234v2, PMID: 12345678, www.aitu.edu.kz. Статья «Federated learning for medical imaging»."
    )
    ids = publications.find_identifiers(text)
    assert ids["doi"] == ["10.1109/access.2020.3012345"]
    assert ids["orcid"] == ["0000-0002-1825-0097"]
    assert ids["arxiv"] == ["2301.01234"]
    assert ids["pmid"] == ["12345678"]
    assert ids["url"] == ["https://www.aitu.edu.kz"]
    assert ids["title"] == ["Federated learning for medical imaging"]


def test_doi_keeps_balanced_parentheses():
    assert publications.find_identifiers("DOI: 10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI1>3.0.CO;2-0")["doi"]
    assert publications.find_identifiers("(DOI 10.1016/j.eswa.2024.123456).")["doi"] == ["10.1016/j.eswa.2024.123456"]


@pytest.mark.parametrize(
    "orcid,ok",
    [("0000-0002-1825-0097", True), ("0000-0002-1825-0098", False), ("0000-0001-5109-3700", True), ("0000-0002-1694-233X", True)],
)
def test_orcid_checksum(orcid, ok):
    assert publications.orcid_valid(orcid) is ok


def test_cyrillic_name_matches_latin_author():
    assert publications.author_match("Иванов Иван Иванович", [{"name": "Ivan Ivanov", "family": "Ivanov"}])
    assert publications.author_match("Жумабеков Ерлан", [{"name": "Yerlan Zhumabekov", "family": "Zhumabekov"}])
    assert publications.author_match("Хасенов Айдос", [{"name": "Aidos Khassenov", "family": "Khassenov"}])
    assert not publications.author_match("Иванов Иван", [{"name": "Ashish Vaswani", "family": "Vaswani"}])
    assert publications.author_match("Carberry Josiah", [{"name": "Josiah Carberry", "family": "Carberry"}])


def test_non_publication_claim_without_identifiers_is_skipped(api):
    assert publications.verify("Организовал кружок шахмат", "Организовал кружок шахмат", "Иванов") is None
    assert api.calls == []


def test_verified_publication_reaches_level_4(api):
    claim = "Статья «A Methodology for the Emulation of Architecture» в журнале Journal of Psychoceramics (2012). DOI: 10.5555/12345680"
    r = publications.verify(claim, claim, "Carberry Josiah", extra_orcids=["0000-0002-1825-0097"])
    assert r["status"] == "verified" and r["level"] == 4
    assert [s["ok"] for s in r["steps"]] == [True, True, True, True]
    rec = r["records"][0]
    assert rec["venue"] == "Journal of Psychoceramics" and rec["institutions"] == ["Brown University"]
    assert "OpenAlex" in rec["sources"]


def test_not_found_doi(api):
    claim = "Статья принята в журнал Expert Systems with Applications, DOI: 10.1016/j.eswa.2099.123456"
    r = publications.verify(claim, claim, "Иванов Иван")
    assert r["status"] == "not_found" and r["level"] == 1
    assert r["flags"][0]["code"] == "not_found"


def test_retracted_publication_is_conflict(api):
    claim = "Статья «Toward a Unified Theory of High-Energy Metaphysics» в журнале, DOI 10.5555/12345678"
    r = publications.verify(claim, claim, "Carberry Josiah")
    assert r["status"] == "conflict"
    assert any(f["code"] == "retracted" for f in r["flags"])
    assert r["level"] == 2 and r["steps"][2]["detail"] == "публикация отозвана (retracted)"


def test_preprint_claimed_as_journal_and_foreign_authors(api):
    claim = "Статья «Attention Is All You Need» опубликована в журнале Q1: https://arxiv.org/abs/1706.03762"
    r = publications.verify(claim, claim, "Иванов Иван")
    codes = {f["code"] for f in r["flags"]}
    assert r["status"] == "conflict" and {"preprint_vs_journal", "author_mismatch"} <= codes
    assert r["level"] == 2


def test_title_mismatch_is_flagged(api):
    claim = "Статья «Совсем другое название исследования» в журнале, DOI: 10.5555/12345680"
    r = publications.verify(claim, claim, "Carberry Josiah")
    assert r["status"] == "conflict" and any(f["code"] == "title_mismatch" for f in r["flags"])


def test_invalid_orcid_and_foreign_orcid(api):
    r = publications.verify(
        "Статья в журнале, ORCID 0000-0002-1825-0098", "Статья в журнале, ORCID 0000-0002-1825-0098", "Иванов"
    )
    assert any(f["code"] == "invalid_orcid" for f in r["flags"]) and r["status"] == "conflict"
    r = publications.verify("Статья в журнале", "Статья в журнале ORCID 0000-0002-1825-0097", "Иванов Иван")
    assert any(f["code"] == "orcid_name_mismatch" for f in r["flags"])


def test_title_found_in_employee_orcid_profile(api):
    claim = "Статья «A Methodology for the Emulation of Architecture» опубликована в журнале"
    r = publications.verify(claim, claim, "Carberry Josiah", extra_orcids=["0000-0002-1825-0097"])
    assert r["status"] == "verified" and r["records"][0]["found_via"].startswith("профиль ORCID")


def test_url_checks_and_private_addresses(api, monkeypatch):
    claim = "Сертификат курса, проверка: https://example.org/cert/42"
    r = publications.verify(claim, claim, "Иванов")
    assert r["urls"][0]["ok"] and r["urls"][0]["title"] == "Certificate & verification" and r["level"] == 2
    r = publications.verify("Сертификат https://example.org/missing", "Сертификат https://example.org/missing", "Иванов")
    assert any(f["code"] == "url_broken" for f in r["flags"])
    res = publications.check_url("http://127.0.0.1:8000/admin")
    assert not res["ok"] and "не является публичным" in res["error"]


def test_unavailable_network_does_not_gate(api, monkeypatch):
    def boom():
        raise httpx.ConnectError("offline")

    def failing_client(contact=True):
        return httpx.Client(transport=httpx.MockTransport(lambda r: boom()))

    monkeypatch.setattr(publications, "_client", failing_client)
    claim = "Статья в журнале, DOI 10.9999/zzz.1"
    r = publications.verify(claim, claim, "Иванов")
    assert r["status"] == "unavailable" and r["status"] not in publications.GATE_STATUSES


def test_responses_are_cached(api):
    claim = "DOI: 10.5555/12345680 статья"
    publications.verify(claim, claim, "Carberry Josiah")
    n = len(api.calls)
    publications.verify(claim, claim, "Carberry Josiah")
    assert len(api.calls) == n
    cached = list(config.LOOKUP_CACHE_DIR.glob("*.json"))
    assert cached and "status" in json.loads(cached[0].read_text(encoding="utf-8"))


def test_title_search_candidate_with_foreign_authors(api):
    api.routes["https://api.openalex.org/works?"] = (
        200,
        {
            "results": [
                {
                    "title": "Attention Is All You Need",
                    "doi": "https://doi.org/10.48550/arxiv.1706.03762",
                    "publication_year": 2017,
                    "authorships": [{"author": {"display_name": "Ashish Vaswani"}}],
                    "cited_by_count": 100000,
                }
            ]
        },
    )
    claim = "Статья «Attention Is All You Need» опубликована в журнале Q1, аффилиация AITU"
    r = publications.verify(claim, claim, "Иванов Иван")
    assert r["candidate"]["similarity"] == 1.0
    assert r["status"] == "conflict" and any(f["code"] == "title_taken" for f in r["flags"])


def test_contact_email_never_sent_to_employee_links(monkeypatch):
    monkeypatch.setattr(config, "CONTACT_EMAIL", "kpi@example.org")
    assert "mailto:kpi@example.org" in publications._client().headers["User-Agent"]
    assert "kpi@example.org" not in publications._client(contact=False).headers["User-Agent"]
    seen = []
    monkeypatch.setattr(publications, "_public_host", lambda host: True)
    real = publications._client

    def spy(contact=True):
        c = real(contact)
        c._transport = httpx.MockTransport(
            lambda r: (seen.append(r.headers["User-Agent"]), httpx.Response(200, text="<title>x</title>"))[1]
        )
        return c

    monkeypatch.setattr(publications, "_client", spy)
    monkeypatch.setattr(config, "LOOKUP_CACHE_DIR", config.LOOKUP_CACHE_DIR / "_contact_test")
    config.LOOKUP_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    publications.check_url("https://employee-site.example/page")
    assert seen and all("kpi@example.org" not in ua for ua in seen)


def test_orcid_profile_does_not_lift_missing_doi_to_level_2(api):
    claim = "Статья принята в журнал, DOI: 10.1016/j.eswa.2099.123456"
    r = publications.verify(claim, claim, "Carberry Josiah", extra_orcids=["0000-0002-1825-0097"])
    assert r["status"] == "not_found" and r["level"] == 1 and r["orcid_profiles"]
