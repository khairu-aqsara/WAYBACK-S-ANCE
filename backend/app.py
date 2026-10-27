"""HTTP API for the Seance Console."""

import asyncio
import json
import re

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import archive
import config
import ollama
import pipeline
import seance

app = FastAPI(title="Wayback Seance")
jobs: dict[str, asyncio.Task] = {}
TERMINAL = {"done", "error"}
REPLAY_PACED = {"snapshot", "page", "digest"}
SITE_ID = re.compile(r"^[a-z0-9-]{1,200}$")
TIMESTAMP = re.compile(r"^\d{14}$")


class SummonBody(BaseModel):
    url: str


class AskBody(BaseModel):
    question: str


def _site_or_404(site_id: str) -> dict:
    site = pipeline.load_site(site_id) if SITE_ID.match(site_id) else None
    if site is None:
        raise HTTPException(404, "No seance has been held for this site.")
    return site


def _running(site_id: str) -> bool:
    return site_id in jobs and not jobs[site_id].done()


def _read_json(site_id: str, name: str):
    path = pipeline.site_dir(site_id) / name
    return json.loads(path.read_text()) if path.exists() else None


@app.get("/api/health")
async def health():
    return {"ollama": await ollama.available(), "chat_model": config.CHAT_MODEL, "embed_model": config.EMBED_MODEL}


@app.post("/api/summon")
async def summon(body: SummonBody):
    normalized = archive.normalize_url(body.url)
    if "." not in normalized.split("/")[0] or len(normalized) > 300:
        raise HTTPException(422, "That does not look like a web address.")
    site_id = archive.slugify(body.url)
    site = pipeline.load_site(site_id)
    cached = bool(site and site.get("status") == "done")
    if not cached and not _running(site_id):
        events = pipeline.site_dir(site_id) / "events.jsonl"
        events.unlink(missing_ok=True)  # the stream must not read a previous run
        jobs[site_id] = asyncio.create_task(pipeline.run(body.url))
    return {"site_id": site_id, "cached": cached}


@app.get("/api/sites/{site_id}/events")
async def events(site_id: str, replay: bool = False):
    if not SITE_ID.match(site_id):
        raise HTTPException(404)
    path = pipeline.site_dir(site_id) / "events.jsonl"

    async def stream():
        position, idle = 0, 0.0
        while True:
            lines = []
            if path.exists():
                with path.open() as f:
                    f.seek(position)
                    for line in f:
                        if not line.endswith("\n"):  # half-written line, read it next time
                            break
                        lines.append(line)
                        position += len(line.encode())
            for line in lines:
                event = json.loads(line)
                if replay and event["type"] in REPLAY_PACED:
                    await asyncio.sleep(config.REPLAY_CADENCE_S)
                yield f"data: {line.strip()}\n\n"
                if event["type"] in TERMINAL:
                    return
            if lines:
                idle = 0.0
            elif not _running(site_id) and idle > 3:
                yield 'data: {"type": "error", "code": "stale", "message": "No seance is in progress."}\n\n'
                return
            await asyncio.sleep(0.2)
            idle += 0.2

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/sites/{site_id}")
async def get_site(site_id: str):
    site = _site_or_404(site_id)
    return {
        **site,
        "running": _running(site_id),
        "digests": _read_json(site_id, "digests.json") or [],
        "seance": _read_json(site_id, "seance.json"),
    }


@app.get("/api/sites/{site_id}/snapshots/{ts}")
async def get_snapshot(site_id: str, ts: str):
    site = _site_or_404(site_id)
    snap = next((s for s in site["snapshots"] if s["ts"] == ts), None) if TIMESTAMP.match(ts) else None
    if snap is None:
        raise HTTPException(404, "No such snapshot.")
    text_dir = pipeline.site_dir(site_id) / "text"
    pages = [
        {"page": p["page"], "title": p.get("title", ""), "text": (text_dir / p["file"]).read_text()}
        for p in snap["pages"]
        if p["status"] == "ok"
    ]
    return {"ts": ts, "original": snap["original"], "pages": pages}


@app.post("/api/sites/{site_id}/ask")
async def ask(site_id: str, body: AskBody):
    site = _site_or_404(site_id)
    question = body.question.strip()
    if not question or len(question) > 500:
        raise HTTPException(422, "Ask a question of up to 500 characters.")
    if site.get("status") != "done":
        raise HTTPException(409, "The site has not been summoned yet.")
    try:
        ollama.reset_usage()
        result = await seance.answer(pipeline.site_dir(site_id), site["url"], question)
        return {**result, "usage": ollama.reset_usage()}
    except httpx.HTTPError:
        raise HTTPException(503, "Ollama did not answer. Is it running?")


@app.get("/api/sites")
async def list_sites():
    sites = []
    for path in sorted(config.CACHE_DIR.glob("*/site.json")):
        site = json.loads(path.read_text())
        if site.get("status") != "done":
            continue
        kept = [s["ts"] for s in site["snapshots"] if s.get("status") == "ok"]
        result = _read_json(site["id"], "seance.json") or {}
        first_line = re.sub(r"\s*\[\d+\]", "", result.get("text", "")).split(". ")[0]
        sites.append({"id": site["id"], "url": site["url"], "first": kept[0], "last": kept[-1], "line": first_line})
    return sites
