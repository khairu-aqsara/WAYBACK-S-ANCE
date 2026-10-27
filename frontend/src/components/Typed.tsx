import { useEffect, useMemo, useRef, useState } from "react";
import { fmtDate, type Citation } from "../api";

type Token = { kind: "text"; value: string } | { kind: "cite"; n: number };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const part of text.split(/(\[\d+\])/)) {
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) tokens.push({ kind: "cite", n: Number(cite[1]) });
    else for (const word of part.split(/(?<=\s)/)) if (word) tokens.push({ kind: "text", value: word });
  }
  return tokens;
}

export interface CiteHandlers {
  onCite: (citation: Citation) => void;
  onHoverTs: (ts: string | null) => void;
}

export function Chip({ citation, onCite, onHoverTs }: { citation: Citation } & CiteHandlers) {
  return (
    <button
      className="mx-0.5 inline-flex -translate-y-px items-center gap-1 rounded-sm border border-amber/40 bg-amber/10 px-1.5 align-middle font-mono text-[10px] leading-4 tracking-wider text-amber transition hover:border-amber hover:bg-amber/25 hover:shadow-[0_0_12px_rgb(255_179_71/0.4)] focus-visible:outline focus-visible:outline-amber"
      onMouseEnter={() => onHoverTs(citation.ts)}
      onMouseLeave={() => onHoverTs(null)}
      onFocus={() => onHoverTs(citation.ts)}
      onBlur={() => onHoverTs(null)}
      onClick={() => onCite(citation)}
      aria-label={`Source ${citation.n}, snapshot ${fmtDate(citation.ts)}`}
    >
      <span className="opacity-50">{citation.n}</span>
      {fmtDate(citation.ts)}
    </button>
  );
}

interface TypedProps extends CiteHandlers {
  text: string;
  citations: Citation[];
  instant?: boolean;
  speedMs?: number;
  onDone?: () => void;
  className?: string;
}

/** Types text in word by word; [n] markers become citation chips. Click to skip. */
export default function Typed({ text, citations, instant, speedMs = 38, onDone, className = "", ...handlers }: TypedProps) {
  const tokens = useMemo(() => tokenize(text), [text]);
  const [count, setCount] = useState(instant ? tokens.length : 0);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (count >= tokens.length) {
      if (!done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
      return;
    }
    const timer = setTimeout(() => setCount((n) => n + 1), tokens[count].kind === "cite" ? 110 : speedMs);
    return () => clearTimeout(timer);
  }, [count, tokens, speedMs]);

  const typing = count < tokens.length;
  return (
    <div className={`whitespace-pre-wrap ${className}`} onClick={() => typing && setCount(tokens.length)}>
      {tokens.slice(0, count).map((token, i) => {
        if (token.kind === "text") return <span key={i}>{token.value}</span>;
        const citation = citations.find((c) => c.n === token.n);
        return citation ? <Chip key={i} citation={citation} {...handlers} /> : null;
      })}
      {typing && <span className="caret ml-0.5 inline-block h-[1em] w-[0.5em] translate-y-[0.15em] bg-amber" />}
    </div>
  );
}
