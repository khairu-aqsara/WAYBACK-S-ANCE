import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { api, type Health } from "./api";
import { useSeance } from "./useSeance";
import Drawer, { type DrawerTarget } from "./components/Drawer";
import Radar from "./components/Radar";
import Summon from "./components/Summon";
import Ticker from "./components/Ticker";
import Timeline from "./components/Timeline";
import Transcript from "./components/Transcript";

const STAGE_TITLES: Record<string, string> = {
  listing: "ASKING THE ARCHIVE",
  fetching: "PULLING SNAPSHOTS OUT OF THE DARK",
  deepening: "READING THE DEEPER ROOMS",
  chunking: "GATHERING FRAGMENTS",
  embedding: "THE MEDIUM IS LISTENING",
  remembering: "REMEMBERING, YEAR BY YEAR",
  speaking: "IT IS ABOUT TO SPEAK",
};

const ERRORS: Record<string, string> = {
  ollama_unavailable: "The archive answered. The medium is silent.",
  no_snapshots: "Nothing answered.",
  all_junk: "Only static on the line.",
};

function useRadarSize() {
  const compute = () => Math.max(260, Math.min(520, window.innerWidth - 32, window.innerHeight - 330));
  const [size, setSize] = useState(compute);
  useEffect(() => {
    const onResize = () => setSize(compute());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

function EyeMark() {
  return (
    <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden>
      <path d="M1 8 Q14 -4 27 8 Q14 20 1 8 Z" fill="none" stroke="#5ff2ff" strokeOpacity="0.8" />
      <circle cx="14" cy="8" r="3.2" fill="#ffb347" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[9px] tracking-[0.35em] text-dim">{label}</div>
      <div className="mt-1 font-display text-lg text-ink">{value}</div>
    </div>
  );
}

export default function App() {
  const { state, summon, reset } = useSeance();
  const [hoverTs, setHoverTs] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [summonError, setSummonError] = useState<string | null>(null);
  const size = useRadarSize();

  useEffect(() => {
    api.health().then(setHealth, () => setHealth(null));
  }, [state.phase]);

  const start = useCallback(
    async (url: string) => {
      setSummonError(null);
      setDrawer(null);
      try {
        await summon(url);
      } catch (err) {
        setSummonError((err as Error).message);
      }
    },
    [summon],
  );
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const arrived = state.snaps.filter((s) => s.status !== "pending");
  const kept = state.snaps.filter((s) => s.status === "ok");
  const years: [string, string] | null = kept.length ? [kept[0].ts.slice(0, 4), kept[kept.length - 1].ts.slice(0, 4)] : null;
  const radarCenter = state.phase === "summoning" || state.phase === "error";

  return (
    <div className="relative h-full">
      <div className="backdrop" />
      <div className="scanlines" />

      <LayoutGroup>
        <AnimatePresence mode="wait">
          {state.phase === "idle" ? (
            <motion.div key="idle" className="h-full" exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
              <Summon size={size} error={summonError} onSummon={start} />
            </motion.div>
          ) : (
            <motion.div
              key="console"
              className="relative z-10 flex h-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            >
              <aside className="hidden w-[300px] shrink-0 flex-col border-r border-line bg-panel/40 backdrop-blur-sm lg:flex">
                <button onClick={reset} className="flex items-center gap-3 px-6 pt-6 text-left" aria-label="New seance">
                  <EyeMark />
                  <span className="font-display text-xs tracking-[0.4em] text-ink">
                    WAYBACK <span className="text-amber">SÉANCE</span>
                  </span>
                </button>

                <div className="grid h-[240px] place-items-center">
                  {radarCenter ? (
                    <div className="text-center text-[10px] tracking-[0.4em] text-dim">
                      <div className="mb-2 font-display text-2xl tracking-[0.2em] text-ink">
                        {arrived.length}
                        <span className="text-dim">/{state.snaps.length || "—"}</span>
                      </div>
                      SNAPSHOTS ANSWERED
                    </div>
                  ) : (
                    <motion.div layoutId="radar" transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}>
                      <Radar snaps={state.snaps} size={200} highlightTs={hoverTs} mini />
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-line px-6 py-5">
                  <Stat label="SNAPSHOTS" value={state.snaps.length ? `${kept.length}/${state.snaps.length}` : "—"} />
                  <Stat label="ROOMS" value={state.pageCount || "—"} />
                  <Stat label="FRAGMENTS" value={state.chunks ?? "—"} />
                  <Stat label="SPAN" value={years ? `${+years[1] - +years[0] + 1} yrs` : "—"} />
                </div>

                <div className="border-b border-line px-6 py-4 text-[10px] tracking-[0.25em]">
                  <div className="text-dim">MEDIUM</div>
                  <div className="mt-2 flex items-center gap-2 text-ink">
                    <span className={`h-1.5 w-1.5 rounded-full ${health?.ollama ? "bg-cyan shadow-[0_0_8px_#5ff2ff]" : "bg-violet"}`} />
                    {health?.chat_model ?? "unknown"}
                  </div>
                  <div className="mt-1 text-dim">{health?.ollama ? "LOCAL · OPEN WEIGHTS" : "OLLAMA OFFLINE"}</div>
                </div>

                <Ticker log={state.log} className="min-h-0 flex-1 px-6 py-4" />
              </aside>

              <main className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between px-6 pt-5 lg:hidden">
                  <button onClick={reset} className="flex items-center gap-3" aria-label="New seance">
                    <EyeMark />
                    <span className="font-display text-[10px] tracking-[0.4em]">
                      WAYBACK <span className="text-amber">SÉANCE</span>
                    </span>
                  </button>
                </div>

                <Timeline
                  snaps={state.snaps}
                  digests={state.digests}
                  highlightTs={hoverTs}
                  onHover={setHoverTs}
                  onSelect={(ts) => setDrawer({ ts })}
                />

                {radarCenter ? (
                  <div className="thin-scroll flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 pb-8">
                    <motion.div layoutId="radar" transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}>
                      <Radar snaps={state.snaps} size={size} listening={state.phase === "summoning"} highlightTs={hoverTs} />
                    </motion.div>

                    {state.phase === "summoning" ? (
                      <div className="mt-2 text-center">
                        <motion.div
                          key={state.stage}
                          initial={{ opacity: 0, letterSpacing: "0.8em" }}
                          animate={{ opacity: 1, letterSpacing: "0.4em" }}
                          className="glow-cyan font-display text-sm text-cyan"
                        >
                          {STAGE_TITLES[state.stage ?? "listing"] ?? "LISTENING"}
                        </motion.div>
                        {state.snaps.length > 0 && (
                          <div className="mt-2 text-[11px] tracking-[0.3em] text-dim">
                            {arrived.length} / {state.snaps.length} · {state.url}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 max-w-md border border-violet/40 bg-panel/80 p-6 text-center">
                        <div className="font-display text-lg tracking-[0.2em] text-violet">
                          {ERRORS[state.error?.code ?? ""] ?? "The line went dead."}
                        </div>
                        <p className="mt-3 text-xs leading-5 text-ink/70">{state.error?.message}</p>
                        {state.error?.code === "ollama_unavailable" && (
                          <pre className="mt-4 bg-void p-3 text-left text-[11px] leading-5 text-cyan/80">
                            {`ollama serve\nollama pull ${health?.chat_model ?? "gemma4:e2b-mlx"}\nollama pull ${health?.embed_model ?? "nomic-embed-text"}`}
                          </pre>
                        )}
                        <div className="mt-5 flex justify-center gap-3 text-[11px] tracking-[0.3em]">
                          <button onClick={() => start(state.url)} className="border border-cyan/40 px-4 py-2 text-cyan hover:bg-cyan/10">
                            TRY AGAIN
                          </button>
                          <button onClick={reset} className="border border-line px-4 py-2 text-dim hover:text-ink">
                            ANOTHER SITE
                          </button>
                        </div>
                      </div>
                    )}

                    <Ticker log={state.log.slice(-8)} className="mt-6 w-full max-w-md lg:hidden" />
                  </div>
                ) : (
                  state.seance &&
                  state.siteId && (
                    <Transcript
                      siteId={state.siteId}
                      url={state.url}
                      years={years}
                      remembered={kept.length}
                      seance={state.seance}
                      ready={state.done}
                      onCite={(citation) => setDrawer({ ts: citation.ts, citation })}
                      onHoverTs={setHoverTs}
                    />
                  )
                )}
              </main>
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>

      <Drawer siteId={state.siteId} target={drawer} digests={state.digests} onClose={closeDrawer} />
    </div>
  );
}
