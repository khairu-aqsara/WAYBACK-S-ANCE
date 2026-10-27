"""Chunking and retrieval over archived text."""

import numpy as np

import config


def chunk_text(text: str, size: int = config.CHUNK_SIZE, overlap: int = config.CHUNK_OVERLAP) -> list[str]:
    """Split text into windows of at most `size` characters, cutting at spaces where possible."""
    text = " ".join(text.split())
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            space = text.rfind(" ", start + size // 2, end)
            if space != -1:
                end = space
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def build_chunks(pages: list[dict]) -> list[dict]:
    """pages are {ts, page, text}. Returns chunks {id, ts, page, text} in page order."""
    chunks = []
    for page in pages:
        for piece in chunk_text(page["text"]):
            chunks.append({"id": len(chunks), "ts": page["ts"], "page": page["page"], "text": piece})
    return chunks


def top_k(matrix: np.ndarray, query: np.ndarray, k: int = config.TOP_K) -> list[tuple[int, float]]:
    """Indices and cosine scores of the k rows most similar to query, best first."""
    if len(matrix) == 0:
        return []
    norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(query)
    scores = (matrix @ query) / np.where(norms == 0, 1, norms)
    order = np.argsort(-scores)[:k]
    return [(int(i), float(scores[i])) for i in order]
