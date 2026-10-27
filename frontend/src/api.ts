export type SnapStatus = "pending" | "ok" | "junk" | "missing";

export interface Snap {
  ts: string;
  status: SnapStatus;
  chars: number;
  title: string;
}

export interface Citation {
  n: number;
  ts: string;
  page: string;
  text: string;
}

export interface SeanceResult {
  text: string;
  citations: Citation[];
}

export interface Answer {
  answer: string;
  refused: boolean;
  score: number | null;
  citations: Citation[];
}

export interface SnapshotPages {
  ts: string;
  original: string;
  pages: { page: string; title: string; text: string }[];
}

export interface Health {
  ollama: boolean;
  chat_model: string;
  embed_model: string;
}

export interface Usage {
  calls: number;
  prompt_tokens: number;
  output_tokens: number;
  model_seconds: number;
}

export type SeanceEvent =
  | { type: "summon"; url: string }
  | ({ type: "usage" } & Usage)
  | { type: "stage"; stage: string; chunks?: number; snapshots?: string[] }
  | { type: "timeline"; snapshots: { ts: string }[] }
  | { type: "snapshot"; ts: string; status: SnapStatus; chars: number; title: string }
  | { type: "page"; ts: string; page: string; status: SnapStatus; chars: number }
  | { type: "digest"; ts: string; text: string }
  | ({ type: "seance" } & SeanceResult)
  | { type: "done" }
  | { type: "error"; code: string; message: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed with ${response.status}`);
  }
  return response.json();
}

export const api = {
  health: () => request<Health>("/api/health"),
  summon: (url: string) =>
    request<{ site_id: string; cached: boolean }>("/api/summon", { method: "POST", body: JSON.stringify({ url }) }),
  site: (id: string) => request<{ url: string; seance: SeanceResult | null; digests: { ts: string; text: string }[] }>(`/api/sites/${id}`),
  snapshot: (id: string, ts: string) => request<SnapshotPages>(`/api/sites/${id}/snapshots/${ts}`),
  ask: (id: string, question: string) =>
    request<Answer>(`/api/sites/${id}/ask`, { method: "POST", body: JSON.stringify({ question }) }),
  events: (id: string, replay: boolean) => new EventSource(`/api/sites/${id}/events${replay ? "?replay=1" : ""}`),
};

export const fmtDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}`;
export const fmtDay = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
export const tsToTime = (ts: string) =>
  Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8));
