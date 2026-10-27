import os
from pathlib import Path

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
CHAT_MODEL = os.environ.get("SEANCE_CHAT_MODEL", "gemma4:e2b-mlx")
EMBED_MODEL = os.environ.get("SEANCE_EMBED_MODEL", "nomic-embed-text")

CACHE_DIR = Path(os.environ.get("SEANCE_CACHE", Path(__file__).resolve().parent.parent / "cache"))

MAX_SNAPSHOTS = 20
MIN_TEXT_CHARS = 200
DEPTH1_MAX_PAGES = 8
FETCH_PAUSE_S = 0.5

CHUNK_SIZE = 600
CHUNK_OVERLAP = 100
TOP_K = 6
# Below this cosine score the site refuses without calling the model. Measured on
# del.icio.us: on-topic 0.516 to 0.761, off-topic 0.540 to 0.580, so it is only a floor.
# The model refusal and the citation check do the real filtering.
REFUSAL_THRESHOLD = float(os.environ.get("SEANCE_THRESHOLD", "0.45"))

REPLAY_CADENCE_S = 0.3
REFUSAL_LINE = "I do not remember that."
