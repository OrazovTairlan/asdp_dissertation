from __future__ import annotations

import difflib
import hashlib
import html
import ipaddress
import json
import re
import socket
import time
import unicodedata
from urllib.parse import quote, urljoin, urlparse

import httpx

from . import __version__, config

DOI_RE = re.compile(r"10\.\d{4,9}/[^\s\"'<>«»\[\]{}|]+", re.I)
ORCID_RE = re.compile(r"(?<![\dA-Za-z-])(\d{4}-\d{4}-\d{4}-\d{3}[\dXx])(?![\d-])")
ARXIV_RE = re.compile(r"arxiv(?:\.org/(?:abs|pdf)/|\s*:\s*|\s+)(\d{4}\.\d{4,5})(?:v\d+)?", re.I)
PMID_RE = re.compile(r"\bPMID\s*[:№]?\s*(\d{5,9})\b", re.I)
URL_RE = re.compile(r"(?:https?://|www\.)[^\s<>\"'«»|]+", re.I)
TITLE_RE = re.compile(r"[«\"“]([^«»\"“”\n]{12,300})[»\"”]")
YEAR_RE = re.compile(r"(?<!\d)(19[89]\d|20\d{2})(?!\d)")
PUBLICATION_WORDS = re.compile(
    r"стать|публикац|журнал|монограф|конференц|препринт|proceedings|journal|article|paper|preprint|doi|scopus|web of science",
    re.I,
)
JOURNAL_CLAIM = re.compile(r"журнал|journal", re.I)
AITU_CLAIM = re.compile(r"\bAITU\b|astana\s+it|астана\s+ит", re.I)
TRAIL = ".,;:)]}»\"'"
GATE_STATUSES = {"not_found", "conflict"}
STATUS_TEXT = {
    "verified": "подтверждена",
    "found": "найдена, подтверждено не всё",
    "not_found": "не найдена",
    "conflict": "противоречит заявлению",
    "candidate": "найден кандидат по названию",
    "no_identifiers": "нет идентификаторов для проверки",
    "unavailable": "открытые базы недоступны",
}
PREPRINT_TYPES = {"posted-content", "preprint"}

TRANSLIT = {
    "а": ["a"],
    "б": ["b"],
    "в": ["v"],
    "г": ["g"],
    "д": ["d"],
    "е": ["e"],
    "ё": ["e", "yo"],
    "ж": ["zh", "j"],
    "з": ["z"],
    "и": ["i"],
    "й": ["i", "y"],
    "к": ["k"],
    "л": ["l"],
    "м": ["m"],
    "н": ["n"],
    "о": ["o"],
    "п": ["p"],
    "р": ["r"],
    "с": ["s"],
    "т": ["t"],
    "у": ["u"],
    "ф": ["f"],
    "х": ["kh", "h"],
    "ц": ["ts", "c"],
    "ч": ["ch"],
    "ш": ["sh"],
    "щ": ["shch", "sch"],
    "ъ": [""],
    "ы": ["y", "i"],
    "ь": [""],
    "э": ["e"],
    "ю": ["yu", "iu"],
    "я": ["ya", "ia"],
    "ә": ["a", "ae"],
    "ғ": ["g", "gh"],
    "қ": ["k", "q"],
    "ң": ["n", "ng"],
    "ө": ["o", "oe"],
    "ұ": ["u"],
    "ү": ["u", "ue"],
    "һ": ["h"],
    "і": ["i"],
}


class LookupUnavailable(RuntimeError):
    pass


def _strip_trailing(s: str) -> str:
    while s and s[-1] in TRAIL:
        if s[-1] == ")" and s.count("(") >= s.count(")"):
            break
        s = s[:-1]
    return s


def _dedupe(items):
    return list(dict.fromkeys(i for i in items if i))


def find_identifiers(text: str) -> dict:
    text = text or ""
    dois = _dedupe(_strip_trailing(m.group(0)).lower() for m in DOI_RE.finditer(text))
    orcids = _dedupe(m.group(1).upper() for m in ORCID_RE.finditer(text))
    arxiv = _dedupe(m.group(1) for m in ARXIV_RE.finditer(text))
    pmids = _dedupe(m.group(1) for m in PMID_RE.finditer(text))
    urls = []
    for m in URL_RE.finditer(text):
        u = _strip_trailing(m.group(0))
        low = u.lower()
        if any(d in low for d in dois) or "orcid.org" in low or "arxiv.org" in low:
            continue
        urls.append("https://" + u if low.startswith("www.") else u)
    titles = _dedupe(m.group(1).strip() for m in TITLE_RE.finditer(text))
    return {"doi": dois, "orcid": orcids, "arxiv": arxiv, "pmid": pmids, "url": _dedupe(urls), "title": titles}


def has_identifiers(ids: dict) -> bool:
    return any(ids.get(k) for k in ("doi", "orcid", "arxiv", "pmid", "url"))


def orcid_valid(orcid: str) -> bool:
    digits = orcid.replace("-", "").upper()
    if len(digits) != 16 or not digits[:15].isdigit():
        return False
    total = 0
    for ch in digits[:15]:
        total = (total + int(ch)) * 2
    check = (12 - total % 11) % 11
    return digits[15] == ("X" if check == 10 else str(check))


def _client(contact: bool = True) -> httpx.Client:
    agent = f"KPI-Evaluator/{__version__} (research prototype"
    agent += f"; mailto:{config.CONTACT_EMAIL})" if contact and config.CONTACT_EMAIL else ")"
    return httpx.Client(timeout=config.LOOKUP_TIMEOUT, headers={"User-Agent": agent, "Accept": "application/json"})


def _cache_file(key: str):
    return config.LOOKUP_CACHE_DIR / f"{hashlib.sha256(key.encode('utf-8')).hexdigest()}.json"


def _cache_get(key: str):
    f = _cache_file(key)
    try:
        return json.loads(f.read_text(encoding="utf-8")) if f.exists() else None
    except (OSError, json.JSONDecodeError):
        return None


def _cache_put(key: str, value) -> None:
    f = _cache_file(key)
    tmp = f.with_suffix(".tmp")
    try:
        tmp.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        tmp.replace(f)
    except OSError:
        pass


def _get_json(url: str, params: dict | None = None) -> tuple[int, dict | None]:
    key = url + "?" + json.dumps(params or {}, sort_keys=True)
    hit = _cache_get(key)
    if hit is not None:
        return hit["status"], hit["body"]
    try:
        with _client() as c:
            r = c.get(url, params=params, follow_redirects=True)
    except httpx.HTTPError as e:
        raise LookupUnavailable(f"{urlparse(url).netloc}: {e}") from e
    if r.status_code == 429 or r.status_code >= 500:
        raise LookupUnavailable(f"{urlparse(url).netloc}: HTTP {r.status_code}")
    body = None
    if r.status_code == 200:
        try:
            body = r.json()
        except ValueError:
            body = None
    if r.status_code in (200, 400, 404, 410):
        _cache_put(key, {"status": r.status_code, "body": body, "checked_at": int(time.time())})
    return r.status_code, body


def _orcid_id(value) -> str:
    m = ORCID_RE.search(value or "")
    return m.group(1).upper() if m else ""


def _crossref(doi: str) -> dict | None:
    status, body = _get_json(f"https://api.crossref.org/works/{quote(doi, safe='/')}")
    if status != 200 or not body:
        return None
    m = body.get("message") or {}
    issued = ((m.get("issued") or {}).get("date-parts") or [[None]])[0]
    authors = [
        {
            "name": " ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", ""),
            "family": a.get("family") or a.get("name", ""),
            "orcid": _orcid_id(a.get("ORCID")),
        }
        for a in m.get("author") or []
    ]
    return {
        "source": "Crossref",
        "doi": doi,
        "title": ((m.get("title") or [""])[0] or "").strip(),
        "authors": authors,
        "year": issued[0] if issued else None,
        "venue": (m.get("container-title") or [""])[0],
        "type": m.get("type", ""),
        "publisher": m.get("publisher", ""),
        "cited_by": m.get("is-referenced-by-count"),
        "url": f"https://doi.org/{doi}",
        "retracted": any("retract" in (u.get("type") or "").lower() for u in m.get("updated-by") or []),
        "institutions": [],
    }


def _datacite(doi: str) -> dict | None:
    status, body = _get_json(f"https://api.datacite.org/dois/{quote(doi, safe='/')}")
    if status != 200 or not body:
        return None
    a = (body.get("data") or {}).get("attributes") or {}
    authors = []
    for c in a.get("creators") or []:
        orcid = next(
            (
                _orcid_id(n.get("nameIdentifier"))
                for n in c.get("nameIdentifiers") or []
                if n.get("nameIdentifierScheme") == "ORCID"
            ),
            "",
        )
        family = c.get("familyName") or (c.get("name") or "").split(",")[0]
        authors.append({"name": c.get("name", ""), "family": family, "orcid": orcid})
    publisher = a.get("publisher")
    rtype = ((a.get("types") or {}).get("resourceTypeGeneral") or "").lower()
    return {
        "source": "DataCite",
        "doi": doi,
        "title": ((a.get("titles") or [{}])[0].get("title") or "").strip(),
        "authors": authors,
        "year": a.get("publicationYear"),
        "venue": ((a.get("container") or {}).get("title") or ""),
        "type": "preprint" if rtype == "preprint" else rtype,
        "publisher": publisher.get("name", "") if isinstance(publisher, dict) else (publisher or ""),
        "cited_by": a.get("citationCount"),
        "url": f"https://doi.org/{doi}",
        "retracted": False,
        "institutions": [],
    }


def _openalex(doi: str) -> dict | None:
    status, body = _get_json(f"https://api.openalex.org/works/doi:{quote(doi, safe='/')}")
    if status != 200 or not body:
        return None
    source = (body.get("primary_location") or {}).get("source") or {}
    institutions = _dedupe(i.get("display_name") for a in body.get("authorships") or [] for i in a.get("institutions") or [])
    authors = [
        {
            "name": (a.get("author") or {}).get("display_name", ""),
            "family": "",
            "orcid": _orcid_id((a.get("author") or {}).get("orcid")),
        }
        for a in body.get("authorships") or []
    ]
    return {
        "retracted": bool(body.get("is_retracted")),
        "cited_by": body.get("cited_by_count"),
        "venue": source.get("display_name") or "",
        "venue_type": source.get("type") or "",
        "is_oa": bool((body.get("open_access") or {}).get("is_oa")),
        "institutions": institutions,
        "authors": authors,
        "openalex_id": body.get("id"),
    }


def work_by_doi(doi: str) -> dict | None:
    rec = _crossref(doi) or _datacite(doi)
    if rec is None:
        return None
    try:
        oa = _openalex(doi)
    except LookupUnavailable:
        oa = None
    if oa:
        rec["retracted"] = rec["retracted"] or oa["retracted"]
        rec["cited_by"] = oa["cited_by"] if oa["cited_by"] is not None else rec["cited_by"]
        rec["venue"] = rec["venue"] or oa["venue"]
        rec["venue_type"] = oa["venue_type"]
        rec["is_oa"] = oa["is_oa"]
        rec["institutions"] = oa["institutions"]
        known = {a["orcid"] for a in rec["authors"] if a["orcid"]}
        for a in oa["authors"]:
            if a["orcid"] and a["orcid"] not in known:
                for r in rec["authors"]:
                    if not r["orcid"] and _name_close(r["family"] or r["name"], a["name"]):
                        r["orcid"] = a["orcid"]
        rec["sources"] = [rec["source"], "OpenAlex"]
    else:
        rec["sources"] = [rec["source"]]
    return rec


def work_by_arxiv(arxiv_id: str) -> dict | None:
    rec = work_by_doi(f"10.48550/arxiv.{arxiv_id}")
    if rec:
        rec["url"] = f"https://arxiv.org/abs/{arxiv_id}"
        rec["type"] = rec["type"] or "preprint"
    return rec


def work_by_pmid(pmid: str) -> dict | None:
    status, body = _get_json(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", {"db": "pubmed", "id": pmid, "retmode": "json"}
    )
    item = ((body or {}).get("result") or {}).get(pmid) if status == 200 else None
    if not item or item.get("error"):
        return None
    year = YEAR_RE.search(item.get("pubdate") or "")
    return {
        "source": "PubMed",
        "doi": next((i.get("value", "").lower() for i in item.get("articleids") or [] if i.get("idtype") == "doi"), ""),
        "title": (item.get("title") or "").strip(),
        "authors": [
            {"name": a.get("name", ""), "family": (a.get("name") or "").split(" ")[0], "orcid": ""}
            for a in item.get("authors") or []
        ],
        "year": int(year.group(1)) if year else None,
        "venue": item.get("fulljournalname") or item.get("source") or "",
        "type": "journal-article",
        "publisher": "",
        "cited_by": None,
        "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "retracted": "retracted" in json.dumps(item.get("pubtype") or []).lower(),
        "institutions": [],
        "sources": ["PubMed"],
    }


def orcid_profile(orcid: str) -> dict | None:
    status, person = _get_json(f"https://pub.orcid.org/v3.0/{orcid}/person")
    if status != 200 or not person:
        return None
    name = person.get("name") or {}
    given = ((name.get("given-names") or {}).get("value") or "").strip()
    family = ((name.get("family-name") or {}).get("value") or "").strip()
    works = []
    status, body = _get_json(f"https://pub.orcid.org/v3.0/{orcid}/works")
    groups = (body or {}).get("group") or [] if status == 200 else []
    for g in groups:
        s = (g.get("work-summary") or [{}])[0]
        ids = ((s.get("external-ids") or {}).get("external-id")) or []
        works.append(
            {
                "title": (((s.get("title") or {}).get("title") or {}).get("value") or "").strip(),
                "doi": next((i.get("external-id-value", "").lower() for i in ids if i.get("external-id-type") == "doi"), ""),
                "year": ((((s.get("publication-date") or {}).get("year")) or {}).get("value")),
            }
        )
    return {
        "orcid": orcid,
        "name": f"{given} {family}".strip(),
        "family": family,
        "works": works,
        "url": f"https://orcid.org/{orcid}",
    }


def search_title(title: str) -> dict | None:
    status, body = _get_json(
        "https://api.openalex.org/works",
        {"filter": f"title.search:{title}", "sort": "cited_by_count:desc", "per-page": 5},
    )
    if status != 200 or not body:
        return None
    best = None
    for w in body.get("results") or []:
        sim = similarity(title, w.get("title") or "")
        if sim >= 0.93 and (best is None or sim > best[0]):
            best = (sim, w)
    if not best:
        return None
    w = best[1]
    doi = (w.get("doi") or "").replace("https://doi.org/", "").lower()
    return {
        "title": w.get("title") or "",
        "doi": doi,
        "year": w.get("publication_year"),
        "venue": (((w.get("primary_location") or {}).get("source")) or {}).get("display_name") or "",
        "authors": [((a.get("author") or {}).get("display_name") or "") for a in w.get("authorships") or []][:8],
        "cited_by": w.get("cited_by_count"),
        "similarity": round(best[0], 2),
        "url": f"https://doi.org/{doi}" if doi else w.get("id"),
    }


def _public_host(host: str) -> bool:
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    try:
        return bool(infos) and all(ipaddress.ip_address(i[4][0].split("%")[0]).is_global for i in infos)
    except ValueError:
        return False


def check_url(url: str) -> dict:
    key = "url:" + url
    hit = _cache_get(key)
    if hit is not None:
        return hit
    current = url
    result = {"url": url, "ok": False, "status": None, "final_url": None, "title": "", "error": ""}
    for _ in range(4):
        p = urlparse(current)
        if p.scheme not in ("http", "https") or not p.hostname or not _public_host(p.hostname):
            result["error"] = "адрес не является публичным веб-адресом — не открывался"
            return result
        try:
            with _client(contact=False) as c, c.stream("GET", current, headers={"Accept": "text/html,*/*"}) as r:
                if r.is_redirect:
                    current = urljoin(current, r.headers.get("location", ""))
                    continue
                data = b""
                for part in r.iter_bytes():
                    data += part
                    if len(data) > 300_000:
                        break
                m = re.search(rb"<title[^>]*>(.*?)</title>", data, re.I | re.S)
                title = html.unescape(m.group(1).decode("utf-8", "replace")) if m else ""
                result.update(
                    ok=r.status_code < 400,
                    status=r.status_code,
                    final_url=current,
                    title=re.sub(r"\s+", " ", title).strip()[:200],
                )
                _cache_put(key, result)
                return result
        except httpx.HTTPError as e:
            result["error"] = f"не удалось открыть: {type(e).__name__}"
            return result
    result["error"] = "слишком много перенаправлений"
    return result


def _plain(s: str) -> str:
    s = unicodedata.normalize("NFKD", (s or "").lower())
    return "".join(ch for ch in s if ch.isalnum() and not unicodedata.combining(ch))


def similarity(a: str, b: str) -> float:
    a2 = re.sub(r"[^\w]+", " ", (a or "").lower()).strip()
    b2 = re.sub(r"[^\w]+", " ", (b or "").lower()).strip()
    if not a2 or not b2:
        return 0.0
    return difflib.SequenceMatcher(None, a2, b2).ratio()


def translit_variants(word: str) -> set[str]:
    out = {""}
    for ch in (word or "").lower():
        opts = TRANSLIT.get(ch, [ch])
        out = {o + x for o in out for x in opts}
        if len(out) > 64:
            out = set(list(out)[:64])
    return {_plain(v) for v in out if _plain(v)}


def _is_cyrillic(s: str) -> bool:
    return any("а" <= ch.lower() <= "я" or ch.lower() in "ёәғқңөұүһі" for ch in s or "")


def family_candidates(full_name: str) -> set[str]:
    tokens = [t for t in re.split(r"[\s,]+", (full_name or "").strip()) if len(t) >= 2]
    if not tokens:
        return set()
    if _is_cyrillic(full_name):
        return translit_variants(tokens[0])
    return {_plain(tokens[0]), _plain(tokens[-1])} - {""}


def _name_close(a: str, b: str) -> bool:
    fa, fb = family_candidates(a), family_candidates(b)
    return any(difflib.SequenceMatcher(None, x, y).ratio() >= 0.85 for x in fa for y in fb)


def author_match(employee: str, authors: list[dict]) -> str:
    fams = family_candidates(employee)
    if not fams:
        return ""
    for a in authors:
        cands = ({_plain(a.get("family"))} | family_candidates(a.get("name", ""))) - {""}
        if any(difflib.SequenceMatcher(None, f, c).ratio() >= 0.85 for f in fams for c in cands):
            return a.get("name") or a.get("family")
    return ""


def _flag(code: str, severity: str, text: str) -> dict:
    return {"code": code, "severity": severity, "text": text}


def verify(claim: str, context: str, employee: str = "", extra_orcids: list[str] | None = None) -> dict | None:
    ids = find_identifiers(context or claim)
    for o in extra_orcids or []:
        if o not in ids["orcid"]:
            ids["orcid"].append(o)
    is_publication = bool(PUBLICATION_WORDS.search(claim or ""))
    work_ids = ids["doi"] or ids["arxiv"] or ids["pmid"]
    if not work_ids and not ids["url"] and not is_publication:
        return None
    claimed_titles = find_identifiers(claim)["title"]
    out = {
        "identifiers": {k: v for k, v in ids.items() if k != "title"},
        "claimed_titles": claimed_titles,
        "records": [],
        "orcid_profiles": [],
        "urls": [],
        "candidate": None,
        "flags": [],
        "steps": [],
        "level": 0,
        "status": "no_identifiers",
        "summary": "",
    }
    flags = out["flags"]
    unavailable = ""
    try:
        for doi in ids["doi"][:3]:
            rec = work_by_doi(doi)
            if rec:
                out["records"].append(rec)
            else:
                flags.append(_flag("not_found", "error", f"DOI {doi} не найден ни в Crossref, ни в DataCite"))
        for ax in ids["arxiv"][:2]:
            rec = work_by_arxiv(ax)
            if rec:
                out["records"].append(rec)
            else:
                flags.append(_flag("not_found", "error", f"arXiv {ax} не найден"))
        for pm in ids["pmid"][:2]:
            rec = work_by_pmid(pm)
            if rec:
                out["records"].append(rec)
            else:
                flags.append(_flag("not_found", "error", f"PMID {pm} не найден в PubMed"))
        for o in ids["orcid"][:2]:
            if not orcid_valid(o):
                flags.append(
                    _flag(
                        "invalid_orcid", "error", f"ORCID {o} имеет неверную контрольную цифру — такого идентификатора не бывает"
                    )
                )
                continue
            prof = orcid_profile(o)
            if prof:
                out["orcid_profiles"].append(prof)
            else:
                flags.append(_flag("not_found", "error", f"ORCID {o} не найден в реестре ORCID"))
        for u in ids["url"][:3]:
            res = check_url(u)
            out["urls"].append(res)
            if not res["ok"] and res.get("status"):
                flags.append(_flag("url_broken", "warning", f"Ссылка {u} отвечает ошибкой HTTP {res['status']}"))
        if not out["records"] and is_publication and claimed_titles:
            for t in claimed_titles[:1]:
                for prof in out["orcid_profiles"]:
                    w = next((w for w in prof["works"] if similarity(t, w["title"]) >= 0.9), None)
                    if w and w.get("doi"):
                        rec = work_by_doi(w["doi"])
                        if rec:
                            rec["found_via"] = f"профиль ORCID {prof['orcid']}"
                            out["records"].append(rec)
                if not out["records"]:
                    out["candidate"] = search_title(t)
    except LookupUnavailable as e:
        unavailable = str(e)
    _assess(out, claim, employee)
    if unavailable and not out["records"] and not out["orcid_profiles"]:
        out["status"] = "unavailable"
        out["summary"] = f"Внешние базы недоступны ({unavailable}) — проверка не выполнена"
    return out


def _assess(out: dict, claim: str, employee: str) -> None:
    flags = out["flags"]
    records = out["records"]
    profiles = out["orcid_profiles"]
    ids = out["identifiers"]
    has_id = has_identifiers(ids)
    best = None
    best_sim = None
    for rec in records:
        sims = [similarity(t, rec["title"]) for t in out["claimed_titles"]]
        s = max(sims) if sims else None
        if best is None or (s or 0) > (best_sim or 0):
            best, best_sim = rec, s
    l1 = has_id
    work_ids = ids["doi"] or ids["arxiv"] or ids["pmid"]
    l2 = bool(records) if work_ids else bool(profiles) or any(u["ok"] for u in out["urls"])
    l3 = False
    l3_detail = "нет найденной записи для сравнения"
    if not records and any(u["ok"] for u in out["urls"]):
        l3_detail = "для обычной ссылки содержимое страницы с заявлением не сравнивается — нужна проверка человеком"
    if best:
        if best_sim is None:
            l3 = True
            l3_detail = "в заявлении нет названия в кавычках — сравнение по названию не выполнялось"
        elif best_sim >= 0.8:
            l3 = True
            l3_detail = f"название совпадает на {round(best_sim * 100)}%: «{best['title']}»"
        else:
            l3_detail = f"в базе другое название: «{best['title']}» (совпадение {round(best_sim * 100)}%)"
            flags.append(_flag("title_mismatch", "error", f"Название в базе не совпадает с заявленным: «{best['title']}»"))
        years = [int(y) for y in YEAR_RE.findall(claim or "")]
        if years and best.get("year") and all(abs(int(best["year"]) - y) > 1 for y in years):
            flags.append(
                _flag(
                    "year_mismatch",
                    "warning",
                    f"Год в базе ({best['year']}) отличается от указанного в отчёте ({', '.join(map(str, years))})",
                )
            )
        if best.get("retracted"):
            flags.append(_flag("retracted", "error", "Публикация отозвана (retracted) по данным открытых баз"))
            l3, l3_detail = False, "публикация отозвана (retracted)"
        if JOURNAL_CLAIM.search(claim or "") and (best.get("type") in PREPRINT_TYPES):
            flags.append(_flag("preprint_vs_journal", "error", "Заявлена журнальная статья, а в базе это препринт"))
            l3, l3_detail = False, "заявлена журнальная статья, а в базе это препринт"
        if (
            AITU_CLAIM.search(claim or "")
            and best.get("institutions")
            and not any(re.search(r"astana\s*it", i, re.I) for i in best["institutions"])
        ):
            flags.append(_flag("affiliation_mismatch", "warning", f"Аффилиация в базе: {', '.join(best['institutions'][:3])}"))
    l4 = False
    l4_detail = "не удалось сопоставить автора"
    employee_orcids = []
    for prof in profiles:
        if employee and author_match(employee, [{"name": prof["name"], "family": prof["family"]}]):
            employee_orcids.append(prof["orcid"])
        elif employee:
            flags.append(
                _flag("orcid_name_mismatch", "error", f"ORCID {prof['orcid']} принадлежит другому человеку: {prof['name']}")
            )
    if best:
        by_orcid = next((a for a in best["authors"] if a.get("orcid") and a["orcid"] in employee_orcids), None)
        in_orcid_works = any(
            best["doi"] and best["doi"] == w["doi"] for p in profiles if p["orcid"] in employee_orcids for w in p["works"]
        )
        by_name = author_match(employee, best["authors"]) if employee else ""
        if by_orcid or in_orcid_works:
            l4, l4_detail = (
                True,
                "ORCID сотрудника указан в записи публикации" if by_orcid else "публикация есть в профиле ORCID сотрудника",
            )
        elif by_name:
            l4, l4_detail = True, f"сотрудник найден среди авторов: {by_name}"
        elif employee and best["authors"]:
            names = ", ".join(a["name"] for a in best["authors"][:4])
            l4_detail = f"сотрудника нет среди авторов ({names})"
            flags.append(_flag("author_mismatch", "error", f"Сотрудник не найден среди авторов: {names}"))
        elif not employee:
            l4_detail = "ФИО сотрудника неизвестно — авторство не проверялось"
    cand = out["candidate"]
    if cand and employee and cand.get("authors") and not author_match(employee, [{"name": a} for a in cand["authors"]]):
        names = ", ".join(cand["authors"][:4])
        if cand["similarity"] >= 0.97:
            flags.append(_flag("title_taken", "error", f"Статья с таким названием уже существует у других авторов: {names}"))
    level = 0
    for ok in (l1, l2, l3, l4):
        if not ok:
            break
        level += 1
    out["level"] = level
    id_text = ", ".join(
        [f"DOI {d}" for d in ids["doi"]]
        + [f"arXiv {a}" for a in ids["arxiv"]]
        + [f"PMID {p}" for p in ids["pmid"]]
        + [f"ORCID {o}" for o in ids["orcid"]]
        + [f"ссылка {u}" for u in ids["url"]]
    )
    out["steps"] = [
        {
            "level": 1,
            "title": "Идентификатор в документах",
            "ok": l1,
            "detail": id_text or "DOI, ORCID, arXiv, PMID или ссылка не найдены",
        },
        {"level": 2, "title": "Запись найдена в открытых базах", "ok": l2, "detail": _found_detail(out)},
        {"level": 3, "title": "Совпадает с заявлением", "ok": l3, "detail": l3_detail},
        {"level": 4, "title": "Авторство сотрудника", "ok": l4, "detail": l4_detail},
    ]
    errors = [f for f in flags if f["severity"] == "error"]
    if work_ids and not records:
        out["status"] = "not_found"
        out["summary"] = "Указанный идентификатор публикации не найден в открытых базах"
    elif errors:
        out["status"] = "conflict"
        out["summary"] = "; ".join(f["text"] for f in errors)
    elif level >= 4:
        out["status"] = "verified"
        out["summary"] = "Публикация найдена, совпадает с заявлением, авторство подтверждено"
    elif level >= 2:
        out["status"] = "found"
        out["summary"] = "Запись найдена, но подтверждено не всё: " + next((s["detail"] for s in out["steps"] if not s["ok"]), "")
    elif out["candidate"] and not errors:
        out["status"] = "candidate"
        out["summary"] = (
            f"Идентификатора нет; по названию найдена похожая запись (совпадение {round(out['candidate']['similarity'] * 100)}%) — это не доказательство"
        )
    else:
        out["status"] = "no_identifiers"
        out["summary"] = "В заявлении нет DOI, ORCID, ссылки или другого признака для проверки"


def _found_detail(out: dict) -> str:
    parts = [f"{r['source']}: «{r['title']}»" for r in out["records"]]
    parts += [f"ORCID: {p['name']}" for p in out["orcid_profiles"]]
    parts += [f"ссылка открывается ({u['status']}){': ' + u['title'] if u['title'] else ''}" for u in out["urls"] if u["ok"]]
    return "; ".join(parts) or "ничего не найдено"


_PING: dict = {}


def ping() -> bool:
    if not config.EXTERNAL_LOOKUP:
        return False
    now = time.time()
    if _PING and now - _PING["t"] < 300:
        return _PING["ok"]
    try:
        with _client() as c:
            ok = c.get("https://api.crossref.org/works", params={"rows": 0}, timeout=5).status_code == 200
    except httpx.HTTPError:
        ok = False
    _PING.update(t=now, ok=ok)
    return ok
