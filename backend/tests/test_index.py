import numpy as np

from index import build_chunks, chunk_text, top_k


def test_chunks_respect_size_overlap_and_cover_the_end():
    words = " ".join(f"word{i:04d}" for i in range(200))  # 1799 characters
    chunks = chunk_text(words, size=600, overlap=100)
    assert all(len(c) <= 600 for c in chunks)
    assert chunks[0].startswith("word0000")
    assert chunks[-1].endswith("word0199")
    # consecutive chunks share text
    assert chunks[0].split()[-1] in chunks[1]


def test_short_text_is_one_chunk():
    assert chunk_text("hello  world") == ["hello world"]


def test_build_chunks_numbers_across_pages():
    pages = [{"ts": "20060101000000", "page": "/", "text": "a " * 400}, {"ts": "20070101000000", "page": "/about", "text": "b"}]
    chunks = build_chunks(pages)
    assert [c["id"] for c in chunks] == list(range(len(chunks)))
    assert chunks[-1] == {"id": len(chunks) - 1, "ts": "20070101000000", "page": "/about", "text": "b"}


def test_top_k_ranks_by_cosine():
    matrix = np.array([[1.0, 0.0], [0.6, 0.8], [0.0, 1.0]])
    hits = top_k(matrix, np.array([0.0, 2.0]), k=2)
    assert [i for i, _ in hits] == [2, 1]
    assert round(hits[0][1], 3) == 1.0
