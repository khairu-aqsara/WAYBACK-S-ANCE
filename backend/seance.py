"""Generation in the site's voice, and the citation rules that keep it honest."""

import json
import re
from pathlib import Path

import numpy as np

import config
import ollama
from index import top_k

PROMPTS = Path(__file__).resolve().parent / "prompts"
CITATION = re.compile(r"\[(\d+)\]")
STRICT = (
    "\nYour previous answer cited a passage that does not exist, or cited nothing. "
    "Cite only the passage numbers you were given."
)


def _prompt(name: str, **values) -> str:
    return (PROMPTS / f"{name}.md").read_text().format(**values)


def fmt_date(ts: str) -> str:
    return f"{ts[:4]}-{ts[4:6]}"


def normalize_citations(text: str) -> str:
    """Rewrite grouped citations such as [1, 2] as [1][2], the only form the UI and checker read."""
    return re.sub(
        r"\[(\d+(?:\s*,\s*\d+)+)\]",
        lambda m: "".join(f"[{n.strip()}]" for n in m.group(1).split(",")),
        text,
    )


def citations_in(text: str) -> list[int]:
    """Cited numbers in order of first appearance, without duplicates."""
    return list(dict.fromkeys(int(n) for n in CITATION.findall(text)))


def check_citations(text: str, n_passages: int) -> bool:
    """True when the text is the refusal line, or cites at least once and only existing passages."""
    if text.strip() == config.REFUSAL_LINE:
        return True
    cited = citations_in(text)
    return bool(cited) and all(1 <= n <= n_passages for n in cited)


def strip_invalid(text: str, n_passages: int) -> str:
    """Remove citations that point past the passage list."""
    return CITATION.sub(lambda m: m.group(0) if 1 <= int(m.group(1)) <= n_passages else "", text)


def format_passages(passages: list[dict]) -> str:
    return "\n\n".join(
        f"[{i}] ({fmt_date(p['ts'])}, {p['page']}) {p['text']}" for i, p in enumerate(passages, 1)
    )


def refusal(score: float | None) -> dict:
    return {"answer": config.REFUSAL_LINE, "refused": True, "score": score, "citations": []}


def eras(n: int) -> tuple[range, range, range]:
    """Split n chronological memories into young, middle and last-days index ranges."""
    k = max(1, min(3, n // 3))
    if n <= 2:
        return range(0, 1), range(1, 1), range(1, n)
    return range(0, k), range(k, n - k), range(n - k, n)


def format_memories(digests: list[dict]) -> str:
    sections = []
    for title, span in zip(("WHEN YOU WERE YOUNG", "YOUR MIDDLE YEARS", "YOUR LAST DAYS"), eras(len(digests))):
        if span:
            lines = "\n".join(f"[{i + 1}] ({fmt_date(digests[i]['ts'])}) {digests[i]['text']}" for i in span)
            sections.append(f"{title}\n{lines}")
    return "\n\n".join(sections)


async def digest(url: str, ts: str, text: str) -> str:
    return await ollama.chat(_prompt("digest", url=url), f"Archived on {fmt_date(ts)}:\n\n{text[:4000]}", 0.2)


async def write_seance(url: str, digests: list[dict]) -> dict:
    """digests are {ts, text}, oldest first. Returns the seance text and its citations."""
    raw = await ollama.chat(_prompt("seance", url=url), format_memories(digests), 0.7)
    text = strip_invalid(normalize_citations(raw), len(digests))
    citations = [{"n": n, "ts": digests[n - 1]["ts"], "page": "/", "text": digests[n - 1]["text"]} for n in citations_in(text)]
    return {"text": text, "citations": citations}


async def answer(site_dir: Path, url: str, question: str) -> dict:
    chunks = json.loads((site_dir / "chunks.json").read_text())
    matrix = np.load(site_dir / "embeddings.npy")
    query = np.array((await ollama.embed([question], "search_query"))[0])
    hits = top_k(matrix, query)
    best = hits[0][1] if hits else None
    if best is None or best < config.REFUSAL_THRESHOLD:
        return refusal(best)

    passages = [chunks[i] for i, _ in hits]
    user = f"Passages:\n\n{format_passages(passages)}\n\nVisitor's question: {question}"
    system = _prompt("answer", url=url)
    for attempt_system in (system, system + STRICT):
        text = normalize_citations(await ollama.chat(attempt_system, user, 0.1))
        if check_citations(text, len(passages)):
            break
    else:
        return refusal(best)

    if text.strip() == config.REFUSAL_LINE:
        return refusal(best)
    citations = [{"n": n, **passages[n - 1]} for n in citations_in(text)]
    return {"answer": text, "refused": False, "score": best, "citations": citations}
