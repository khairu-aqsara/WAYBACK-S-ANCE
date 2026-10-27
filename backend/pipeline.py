"""The summoning: archive, index, digest and seance, with every step logged as an event."""

import asyncio
import json
import re
import time
from pathlib import Path

import numpy as np

import archive
import config
import ollama
import seance
from index import build_chunks


def site_dir(site_id: str) -> Path:
    return config.CACHE_DIR / site_id


def load_site(site_id: str) -> dict | None:
    path = site_dir(site_id) / "site.json"
    return json.loads(path.read_text()) if path.exists() else None


def _save_site(site: dict) -> None:
    (site_dir(site["id"]) / "site.json").write_text(json.dumps(site, indent=1))


def _text_file(ts: str, page: str) -> str:
    name = re.sub(r"[^a-z0-9]+", "-", page.lower()).strip("-") or "root"
    return f"{ts}__{name}.txt"


class EventLog:
    def __init__(self, path: Path, fresh: bool) -> None:
        self.path = path
        if fresh:
            path.write_text("")

    def emit(self, type_: str, **data) -> None:
        with self.path.open("a") as f:
            f.write(json.dumps({"type": type_, "t": round(time.time(), 3), **data}) + "\n")


async def _archive(site: dict, log: EventLog) -> None:
    root = site_dir(site["id"])
    (root / "text").mkdir(exist_ok=True)
    log.emit("stage", stage="listing")
    async with archive.client() as http:
        rows = await archive.list_snapshots(http, site["url"])
        if not rows:
            raise PipelineError("no_snapshots", "The archive holds no pages for this address.")
        site["snapshots"] = [{"ts": ts, "original": original, "pages": []} for ts, original in rows]
        log.emit("timeline", snapshots=[{"ts": s["ts"]} for s in site["snapshots"]])

        log.emit("stage", stage="fetching")
        for snap in site["snapshots"]:
            await _fetch_page(http, snap, snap["original"], root)
            home = snap["pages"][0]
            snap.update(status=home["status"], chars=home["chars"], title=home.get("title", ""))
            log.emit("snapshot", ts=snap["ts"], status=snap["status"], chars=snap["chars"], title=snap["title"])
            await asyncio.sleep(config.FETCH_PAUSE_S)

        kept = [s for s in site["snapshots"] if s["status"] == "ok"]
        if not kept:
            raise PipelineError("all_junk", "Every snapshot was empty or a placeholder.")
        peak = max(kept, key=lambda s: s["chars"])
        deep = list(dict.fromkeys(s["ts"] for s in (kept[0], peak, kept[-1])))
        log.emit("stage", stage="deepening", snapshots=deep)
        for snap in (s for s in kept if s["ts"] in deep):
            for link in snap.pop("_links", []):
                page = await _fetch_page(http, snap, link, root)
                log.emit("page", ts=snap["ts"], page=page["page"], status=page["status"], chars=page["chars"])
                await asyncio.sleep(config.FETCH_PAUSE_S)
    for snap in site["snapshots"]:
        snap.pop("_links", None)
    site["status"] = "archived"
    _save_site(site)


async def _fetch_page(http, snap: dict, url: str, root: Path) -> dict:
    page = {"page": archive.page_key(url), "status": "missing", "chars": 0}
    fetched = await archive.fetch(http, snap["ts"], url)
    if fetched is not None:
        html, landed = fetched
        title, text, links = archive.extract(html)
        page.update(title=title, chars=len(text), status="junk" if archive.is_junk(text) else "ok")
        moved_to = archive.landed_elsewhere(url, landed, title, text)
        if moved_to:
            page.update(status="junk", title=f"moved to {moved_to}")
        if page["status"] == "ok":
            page["file"] = _text_file(snap["ts"], page["page"])
            (root / "text" / page["file"]).write_text(text)
        if not snap["pages"]:  # homepage: remember its links for the depth 1 pass
            snap["_links"] = archive.same_host_links(links, url)
    snap["pages"].append(page)
    return page


def _replay_archive(site: dict, log: EventLog) -> None:
    """Re-emit archive events from site.json, so a resumed run still draws the timeline."""
    log.emit("timeline", snapshots=[{"ts": s["ts"]} for s in site["snapshots"]])
    for snap in site["snapshots"]:
        log.emit("snapshot", ts=snap["ts"], status=snap["status"], chars=snap["chars"], title=snap.get("title", ""))
        for page in snap["pages"][1:]:
            log.emit("page", ts=snap["ts"], page=page["page"], status=page["status"], chars=page["chars"])


def _kept_pages(site: dict) -> list[dict]:
    root = site_dir(site["id"]) / "text"
    return [
        {"ts": snap["ts"], "page": page["page"], "home": i == 0, "text": (root / page["file"]).read_text()}
        for snap in site["snapshots"]
        for i, page in enumerate(snap["pages"])
        if page["status"] == "ok"
    ]


async def _summon(site: dict, log: EventLog) -> None:
    root = site_dir(site["id"])
    pages = _kept_pages(site)
    chunks = build_chunks(pages)
    (root / "chunks.json").write_text(json.dumps(chunks))
    log.emit("stage", stage="chunking", chunks=len(chunks))

    if not await ollama.available():
        raise PipelineError(
            "ollama_unavailable",
            f"Ollama is not running, or {config.CHAT_MODEL} and {config.EMBED_MODEL} are not pulled.",
        )

    log.emit("stage", stage="embedding")
    vectors = await ollama.embed([c["text"] for c in chunks], "search_document")
    np.save(root / "embeddings.npy", np.array(vectors, dtype=np.float32))

    log.emit("stage", stage="remembering")
    ollama.reset_usage()
    digests = []
    for page in (p for p in pages if p["home"]):
        text = await seance.digest(site["url"], page["ts"], page["text"])
        digests.append({"ts": page["ts"], "text": text})
        log.emit("digest", ts=page["ts"], text=text)
    (root / "digests.json").write_text(json.dumps(digests, indent=1))

    log.emit("stage", stage="speaking")
    result = await seance.write_seance(site["url"], digests)
    (root / "seance.json").write_text(json.dumps(result, indent=1))
    site["usage"] = ollama.reset_usage()
    log.emit("usage", **site["usage"])
    log.emit("seance", **result)


class PipelineError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


async def run(url: str) -> None:
    site_id = archive.slugify(url)
    root = site_dir(site_id)
    root.mkdir(parents=True, exist_ok=True)
    site = load_site(site_id) or {"id": site_id, "url": archive.normalize_url(url), "snapshots": []}
    log = EventLog(root / "events.jsonl", fresh=True)
    log.emit("summon", url=site["url"])
    try:
        if site.get("status") in ("archived", "error", "done") and site["snapshots"]:
            _replay_archive(site, log)
        else:
            site["status"] = "archiving"
            _save_site(site)
            await _archive(site, log)
        await _summon(site, log)
        site["status"] = "done"
        _save_site(site)
        log.emit("done")
    except PipelineError as err:
        site["status"] = "error" if site.get("snapshots") else "failed"
        _save_site(site)
        log.emit("error", code=err.code, message=str(err))
    except Exception as err:  # keep the event stream terminated for the UI
        site["status"] = "error" if site.get("snapshots") else "failed"
        _save_site(site)
        log.emit("error", code="internal", message=f"{type(err).__name__}: {err}")
        raise
