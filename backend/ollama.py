"""Thin client for the local Ollama server."""

import httpx

import config

# Running totals for the open-versus-closed evidence in the post. Single-user local app.
usage = {"calls": 0, "prompt_tokens": 0, "output_tokens": 0, "model_seconds": 0.0}


def reset_usage() -> dict:
    snapshot = dict(usage)
    usage.update(calls=0, prompt_tokens=0, output_tokens=0, model_seconds=0.0)
    return snapshot


async def available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as http:
            response = await http.get(f"{config.OLLAMA_URL}/api/tags")
            names = {m["name"] for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError):
        return False
    wanted = {config.CHAT_MODEL, config.EMBED_MODEL}
    return all(w in names or f"{w}:latest" in names for w in wanted)


async def embed(texts: list[str], prefix: str) -> list[list[float]]:
    """prefix is `search_document` or `search_query`, as nomic-embed-text expects."""
    async with httpx.AsyncClient(timeout=120.0) as http:
        response = await http.post(
            f"{config.OLLAMA_URL}/api/embed",
            json={"model": config.EMBED_MODEL, "input": [f"{prefix}: {t}" for t in texts]},
        )
        response.raise_for_status()
        return response.json()["embeddings"]


async def chat(system: str, user: str, temperature: float = 0.6) -> str:
    async with httpx.AsyncClient(timeout=300.0) as http:
        response = await http.post(
            f"{config.OLLAMA_URL}/api/chat",
            json={
                "model": config.CHAT_MODEL,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "stream": False,
                # Gemma 4 reasons by default; for summaries it costs ~10x the time for no gain.
                "think": False,
                "options": {"temperature": temperature, "num_ctx": 8192},
            },
        )
        response.raise_for_status()
        body = response.json()
        usage["calls"] += 1
        usage["prompt_tokens"] += body.get("prompt_eval_count", 0)
        usage["output_tokens"] += body.get("eval_count", 0)
        usage["model_seconds"] += body.get("total_duration", 0) / 1e9
        return body["message"]["content"].strip()
