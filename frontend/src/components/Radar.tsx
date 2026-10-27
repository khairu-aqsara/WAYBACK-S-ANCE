import { useId } from "react";
import { motion } from "framer-motion";
import { tsToTime, type Snap } from "../api";

interface Props {
  snaps: Snap[];
  size: number;
  highlightTs?: string | null;
  mini?: boolean;
  listening?: boolean;
}

/** The eye: a radar that plots each snapshot by date (angle) and by how much it said (radius). */
export default function Radar({ snaps, size, highlightTs, mini, listening }: Props) {
  const id = useId();
  const c = size / 2;
  const R = c - (mini ? 6 : 30);
  const times = snaps.map((s) => tsToTime(s.ts));
  const t0 = snaps.length ? Math.min(...times) : 0;
  const span = snaps.length ? Math.max(...times) - t0 || 1 : 1;
  const maxChars = Math.max(1, ...snaps.map((s) => s.chars));
  const arrived = snaps.filter((s) => s.status !== "pending");
  const coverage = snaps.length ? arrived.filter((s) => s.status === "ok").length / snaps.length : 0;

  const place = (s: Snap) => {
    const frac = snaps.length > 1 ? (tsToTime(s.ts) - t0) / span : 0.5;
    const angle = ((-90 + frac * 330) * Math.PI) / 180;
    const r = s.status === "ok" ? R * (0.4 + (0.52 * Math.log1p(s.chars)) / Math.log1p(maxChars)) : R * 0.27;
    return { x: c + r * Math.cos(angle), y: c + r * Math.sin(angle), angle };
  };

  const years = [...new Map(snaps.map((s) => [s.ts.slice(0, 4), s])).values()];
  const pupil = R * (0.045 + 0.075 * coverage);
  const speed = mini ? "10s" : listening ? "3.2s" : "7s";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="sweep absolute rounded-full"
        style={{
          inset: c - R,
          ["--sweep-speed" as string]: speed,
          background: "conic-gradient(from 0deg, transparent 0deg, transparent 280deg, rgb(95 242 255 / 0.05) 300deg, rgb(95 242 255 / 0.28) 359deg, transparent 360deg)",
        }}
      />
      <svg width={size} height={size} className="absolute inset-0 overflow-visible">
        <defs>
          <radialGradient id={`${id}-iris`}>
            <stop offset="0%" stopColor="#ffb347" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ffb347" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#5ff2ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        {[0.33, 0.66, 1].map((k) => (
          <circle key={k} cx={c} cy={c} r={R * k} fill="none" stroke="#5ff2ff" strokeOpacity={k === 1 ? 0.35 : 0.12} />
        ))}
        {!mini && (
          <g stroke="#5ff2ff" strokeOpacity="0.1" strokeDasharray="2 6">
            <line x1={c - R} y1={c} x2={c + R} y2={c} />
            <line x1={c} y1={c - R} x2={c} y2={c + R} />
          </g>
        )}
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i * 5 * Math.PI) / 180;
          const long = i % 6 === 0;
          const r1 = R - (long ? 9 : 4);
          return (
            <line
              key={i}
              x1={c + r1 * Math.cos(a)}
              y1={c + r1 * Math.sin(a)}
              x2={c + R * Math.cos(a)}
              y2={c + R * Math.sin(a)}
              stroke="#5ff2ff"
              strokeOpacity={long ? 0.45 : 0.18}
            />
          );
        })}

        {!mini &&
          years.map((s) => {
            const { angle } = place(s);
            return (
              <text
                key={s.ts}
                x={c + (R + 16) * Math.cos(angle)}
                y={c + (R + 16) * Math.sin(angle)}
                fill="#5b6b78"
                fontSize="9"
                textAnchor="middle"
                dominantBaseline="middle"
                letterSpacing="0.1em"
              >
                {s.ts.slice(0, 4)}
              </text>
            );
          })}

        <circle cx={c} cy={c} r={R * 0.22} fill={`url(#${id}-iris)`} />
        <motion.circle
          cx={c}
          cy={c}
          fill="#05070a"
          stroke="#5ff2ff"
          strokeOpacity="0.7"
          animate={{ r: listening ? [pupil, pupil * 1.35, pupil] : pupil }}
          transition={listening ? { duration: 1.6, repeat: Infinity } : { duration: 0.6 }}
        />

        {arrived.map((s) => {
          const { x, y } = place(s);
          const ok = s.status === "ok";
          const lit = s.ts === highlightTs;
          const color = ok ? (lit ? "#ffb347" : "#5ff2ff") : "#7a6f99";
          return (
            <g key={s.ts}>
              {!mini && (
                <motion.circle
                  cx={x}
                  cy={y}
                  fill="none"
                  stroke={color}
                  initial={{ r: 2, opacity: 0.9 }}
                  animate={{ r: 30, opacity: 0 }}
                  transition={{ duration: 1.4, ease: "easeOut" }}
                />
              )}
              {ok ? (
                <motion.circle
                  cx={x}
                  cy={y}
                  fill={color}
                  initial={{ r: 0 }}
                  animate={{ r: lit ? (mini ? 4 : 6) : mini ? 1.8 : 3 }}
                  style={{ filter: `drop-shadow(0 0 ${lit ? 8 : 4}px ${color})` }}
                />
              ) : (
                <g stroke={color} strokeOpacity="0.8">
                  <line x1={x - 3} y1={y - 3} x2={x + 3} y2={y + 3} />
                  <line x1={x - 3} y1={y + 3} x2={x + 3} y2={y - 3} />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
