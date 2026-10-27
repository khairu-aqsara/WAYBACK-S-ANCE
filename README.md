# Wayback Séance

Name a website that died. Wayback Séance pulls its snapshots from the Internet Archive, reads them with a local open-weight model, and lets you talk to the site as it was. Every claim cites the archived snapshot it came from. When the archive does not hold the answer, the site says it does not remember.

Built for the [Hacktoberfest Open-Source AI Challenge, Week 4: Ghost in the Machine](https://dev.to/challenges/hacktoberfest-week4-2026-10-26).

## Run it

Requirements: Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+, [Ollama](https://ollama.com).

```sh
ollama pull gemma4:e2b-mlx
ollama pull nomic-embed-text

cd backend && uv sync && uv run uvicorn app:app --port 8000
cd frontend && npm install && npm run dev   # http://localhost:5173
```

On a machine where the MLX build does not run, set `SEANCE_CHAT_MODEL=gemma4:e2b`.

## How it works

1. List snapshots with the Wayback CDX API, one per year, more in the first and last year.
2. Fetch each raw snapshot, strip it to text, drop placeholders and empty pages.
3. Read one level deeper on the first, richest and last snapshot.
4. Chunk and embed the text with `nomic-embed-text`.
5. Gemma 4 writes a two-sentence memory of each snapshot, then the séance from those memories.
6. Questions retrieve the closest passages. Below a similarity threshold the site refuses without calling the model. Above it, Gemma answers and every `[n]` citation is checked in code.

Tests: `cd backend && uv run pytest`.

## Credits

- [Internet Archive](https://archive.org) and its [Wayback CDX API](https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server), the source of every word the sites say.
- [Ollama](https://ollama.com), local inference.
- [Gemma 4](https://ai.google.dev/gemma) by Google, the voice of the dead.
- [nomic-embed-text](https://ollama.com/library/nomic-embed-text) by Nomic AI, retrieval.
- [FastAPI](https://fastapi.tiangolo.com), [React](https://react.dev), [Vite](https://vite.dev), [Tailwind CSS](https://tailwindcss.com), [Framer Motion](https://motion.dev).

Archived pages are fetched at run time into `cache/`, which is not committed. All archived content belongs to its original owners.

## Commits after the submission deadline

None.
