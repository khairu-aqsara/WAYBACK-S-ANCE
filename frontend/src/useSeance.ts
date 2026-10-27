import { useCallback, useEffect, useReducer, useRef } from "react";
import { api, fmtDate, type SeanceEvent, type SeanceResult, type Snap } from "./api";

export interface LogLine {
  id: number;
  kind: "info" | "ok" | "junk" | "error" | "voice";
  text: string;
}

export interface SeanceState {
  phase: "idle" | "summoning" | "seance" | "error";
  siteId?: string;
  url: string;
  stage?: string;
  snaps: Snap[];
  pageCount: number;
  chunks?: number;
  digests: Record<string, string>;
  log: LogLine[];
  seance?: SeanceResult;
  done: boolean;
  error?: { code: string; message: string };
}

type Action =
  | { type: "start"; url: string; siteId: string }
  | { type: "event"; event: SeanceEvent }
  | { type: "fail"; code: string; message: string }
  | { type: "reset" };

const initial: SeanceState = { phase: "idle", url: "", snaps: [], pageCount: 0, digests: {}, log: [], done: false };

const STAGE_LINES: Record<string, string> = {
  listing: "asking the archive who remembers",
  fetching: "pulling snapshots out of the dark",
  deepening: "reading deeper rooms: first, brightest and last",
  embedding: "the medium is listening",
  remembering: "remembering, year by year",
  speaking: "it is ready to speak",
};

let lineId = 0;
function addLog(state: SeanceState, kind: LogLine["kind"], text: string): LogLine[] {
  return [...state.log.slice(-199), { id: ++lineId, kind, text }];
}

function reduce(state: SeanceState, event: SeanceEvent): SeanceState {
  switch (event.type) {
    case "summon":
      return { ...state, log: addLog(state, "info", `opening a line to ${event.url}`) };
    case "stage": {
      const text =
        event.stage === "chunking" ? `${event.chunks} fragments of memory gathered` : STAGE_LINES[event.stage] ?? event.stage;
      return { ...state, stage: event.stage, chunks: event.chunks ?? state.chunks, log: addLog(state, "info", text) };
    }
    case "timeline": {
      const snaps = event.snapshots.map((s) => ({ ts: s.ts, status: "pending" as const, chars: 0, title: "" }));
      const span = snaps.length ? `${snaps[0].ts.slice(0, 4)} to ${snaps[snaps.length - 1].ts.slice(0, 4)}` : "";
      return { ...state, snaps, log: addLog(state, "info", `${snaps.length} snapshots answered, ${span}`) };
    }
    case "snapshot": {
      const snaps = state.snaps.map((s) => (s.ts === event.ts ? { ...s, status: event.status, chars: event.chars, title: event.title } : s));
      const date = fmtDate(event.ts);
      const line =
        event.status === "ok"
          ? addLog(state, "ok", `${date}  ${event.chars.toLocaleString()} chars  ${event.title || "untitled"}`)
          : event.status === "junk"
            ? addLog(state, "junk", `${date}  static, discarded${event.title ? ` (${event.title})` : ""}`)
            : addLog(state, "junk", `${date}  nothing there`);
      return { ...state, snaps, log: line };
    }
    case "page":
      if (event.status !== "ok") return state;
      return { ...state, pageCount: state.pageCount + 1, log: addLog(state, "ok", `  ${fmtDate(event.ts)}  ${event.page}`) };
    case "digest":
      return {
        ...state,
        digests: { ...state.digests, [event.ts]: event.text },
        log: addLog(state, "voice", `${fmtDate(event.ts)}  remembered`),
      };
    case "seance":
      return { ...state, phase: "seance", seance: { text: event.text, citations: event.citations } };
    case "usage":
      return {
        ...state,
        log: addLog(
          state,
          "info",
          `${event.calls} model calls, ${(event.prompt_tokens + event.output_tokens).toLocaleString()} tokens, ${event.model_seconds.toFixed(1)}s, all local`,
        ),
      };
    case "done":
      return { ...state, done: true };
    case "error":
      return {
        ...state,
        phase: state.seance ? state.phase : "error",
        error: { code: event.code, message: event.message },
        log: addLog(state, "error", event.message),
      };
  }
}

function reducer(state: SeanceState, action: Action): SeanceState {
  switch (action.type) {
    case "start":
      return { ...initial, phase: "summoning", url: action.url, siteId: action.siteId, log: [] };
    case "event":
      return reduce(state, action.event);
    case "fail":
      return { ...state, phase: "error", error: { code: action.code, message: action.message } };
    case "reset":
      return initial;
  }
}

export function useSeance() {
  const [state, dispatch] = useReducer(reducer, initial);
  const source = useRef<EventSource | null>(null);

  const summon = useCallback(async (url: string) => {
    source.current?.close();
    const { site_id, cached } = await api.summon(url);
    dispatch({ type: "start", url, siteId: site_id });
    const events = api.events(site_id, cached);
    events.onmessage = (message) => {
      const event = JSON.parse(message.data) as SeanceEvent;
      dispatch({ type: "event", event });
      if (event.type === "done" || event.type === "error") events.close();
    };
    events.onerror = () => {
      events.close();
      dispatch({ type: "fail", code: "stream", message: "The line went dead. Is the backend running?" });
    };
    source.current = events;
  }, []);

  const reset = useCallback(() => {
    source.current?.close();
    dispatch({ type: "reset" });
  }, []);

  useEffect(() => () => source.current?.close(), []);

  return { state, summon, reset };
}
