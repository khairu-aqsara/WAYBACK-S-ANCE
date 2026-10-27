import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import Radar from "./Radar";

const EXAMPLES = ["del.icio.us", "geocities.com", "friendster.com", "vine.co", "orkut.com"];

interface Props {
  size: number;
  error: string | null;
  onSummon: (url: string) => void;
}

export default function Summon({ size, error, onSummon }: Props) {
  const [url, setUrl] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (url.trim()) onSummon(url.trim());
  }

  return (
    <div className="relative z-10 grid h-full place-items-center overflow-y-auto px-4">
      <div className="grid place-items-center [grid-template-areas:'stack']">
        <motion.div layoutId="radar" className="opacity-60 [grid-area:stack]">
          <Radar snaps={[]} size={size} />
        </motion.div>

        <motion.div
          className="relative flex w-full max-w-xl flex-col items-center text-center [grid-area:stack]"
          exit={{ opacity: 0, filter: "blur(8px)" }}
        >
          <motion.div
            initial={{ opacity: 0, letterSpacing: "1em" }}
            animate={{ opacity: 1, letterSpacing: "0.45em" }}
            transition={{ duration: 2 }}
            className="mb-5 text-[10px] text-dim"
          >
            THE INTERNET ARCHIVE · 1996 TO NOW
          </motion.div>
          <h1 className="font-display leading-none">
            <span className="glow-cyan block text-5xl font-light tracking-[0.35em] text-cyan sm:text-7xl">WAYBACK</span>
            <span className="flicker glow-amber mt-2 block text-5xl font-bold tracking-[0.35em] text-amber sm:text-7xl">SÉANCE</span>
          </h1>
          <p className="mt-6 max-w-sm text-[13px] leading-6 text-ink/70">
            Name a website that died. It will speak to you, and it will only say what its own archived pages can prove.
          </p>

          <form onSubmit={submit} className="mt-8 w-full max-w-md">
            <label className="flex items-center gap-3 border border-cyan/30 bg-void/80 px-4 py-3 backdrop-blur focus-within:border-cyan focus-within:shadow-[0_0_32px_rgb(95_242_255/0.2)]">
              <span className="text-cyan">›</span>
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="a dead website, e.g. del.icio.us"
                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
                aria-label="Website address"
                spellCheck={false}
              />
              <button disabled={!url.trim()} className="text-[11px] tracking-[0.3em] text-amber transition hover:text-white disabled:text-dim">
                SUMMON
              </button>
            </label>
          </form>
          {error && <p className="mt-3 text-xs text-violet">{error}</p>}

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                onClick={() => onSummon(example)}
                className="border border-line bg-void/60 px-3 py-1 text-[11px] text-dim transition hover:border-amber/50 hover:text-amber"
              >
                {example}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
