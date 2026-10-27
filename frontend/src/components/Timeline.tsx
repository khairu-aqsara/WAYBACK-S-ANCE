import { useState } from "react";
import { motion } from "framer-motion";
import { fmtDay, tsToTime, type Snap } from "../api";

interface Props {
  snaps: Snap[];
  digests: Record<string, string>;
  highlightTs: string | null;
  onHover: (ts: string | null) => void;
  onSelect: (ts: string) => void;
}

export default function Timeline({ snaps, digests, highlightTs, onHover, onSelect }: Props) {
  const [hovered, setHovered] = useState<Snap | null>(null);
  if (!snaps.length) {
    return (
      <div className="flex h-28 items-end px-8 pb-9">
        <div className="h-px w-full animate-pulse bg-cyan/20" />
      </div>
    );
  }

  const times = snaps.map((s) => tsToTime(s.ts));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const y0 = new Date(t0).getUTCFullYear();
  const y1 = new Date(t1).getUTCFullYear();
  const step = y1 - y0 > 24 ? 5 : y1 - y0 > 12 ? 2 : 1;
  const x = (t: number) => (t1 === t0 ? 50 : 2 + ((t - t0) / (t1 - t0)) * 96);
  const maxChars = Math.max(1, ...snaps.map((s) => s.chars));

  const years = [];
  for (let y = y0 + 1; y <= y1; y++) if (y % step === 0) years.push(y);

  return (
    <div className="relative h-28 select-none px-8">
      <div className="relative h-full">
        <motion.div
          className="absolute bottom-9 left-0 h-px bg-cyan/40"
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
        />
        {years.map((y) => (
          <div
            key={y}
            className="absolute bottom-2 -translate-x-1/2 text-[10px] tracking-[0.2em] text-dim"
            style={{ left: `${x(Date.UTC(y, 0, 1))}%` }}
          >
            <div className="mx-auto mb-1 h-2 w-px bg-dim/50" />
            {y}
          </div>
        ))}

        {snaps.map((s) => {
          const ok = s.status === "ok";
          const lit = s.ts === highlightTs || s.ts === hovered?.ts;
          const height = ok ? 10 + (40 * Math.log1p(s.chars)) / Math.log1p(maxChars) : 8;
          return (
            <button
              key={s.ts}
              className="group absolute bottom-9 -translate-x-1/2 px-1.5 disabled:cursor-default"
              style={{ left: `${x(tsToTime(s.ts))}%` }}
              disabled={!ok}
              onMouseEnter={() => {
                setHovered(s);
                onHover(s.ts);
              }}
              onMouseLeave={() => {
                setHovered(null);
                onHover(null);
              }}
              onClick={() => ok && onSelect(s.ts)}
              aria-label={`Snapshot ${fmtDay(s.ts)}, ${s.status}`}
            >
              {s.status === "pending" ? (
                <div className="h-1 w-1 rounded-full bg-dim/60" />
              ) : (
                <motion.div
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="origin-bottom"
                  style={{
                    height,
                    width: lit ? 3 : 2,
                    background: ok ? (lit ? "#ffb347" : "#5ff2ff") : "repeating-linear-gradient(#7a6f99 0 2px, transparent 2px 4px)",
                    boxShadow: ok ? `0 0 ${lit ? 14 : 6}px ${lit ? "#ffb347" : "rgb(95 242 255 / 0.6)"}` : "none",
                  }}
                />
              )}
            </button>
          );
        })}

        {hovered && hovered.status !== "pending" && (
          <div
            className="pointer-events-none absolute bottom-[5.5rem] z-20 w-72 -translate-x-1/2 border border-line bg-panel/95 p-3 text-[11px] leading-relaxed shadow-2xl backdrop-blur"
            style={{ left: `clamp(9rem, ${x(tsToTime(hovered.ts))}%, calc(100% - 9rem))` }}
          >
            <div className="mb-1 flex justify-between tracking-widest">
              <span className={hovered.status === "ok" ? "text-cyan" : "text-violet"}>{fmtDay(hovered.ts)}</span>
              <span className="text-dim">{hovered.status === "ok" ? `${hovered.chars.toLocaleString()} chars` : "static"}</span>
            </div>
            <div className="truncate text-ink">{hovered.title || "untitled"}</div>
            {digests[hovered.ts] && <p className="mt-2 text-amber/90">{digests[hovered.ts]}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
