import { useEffect, useRef } from "react";
import type { LogLine } from "../useSeance";

const STYLE: Record<LogLine["kind"], string> = {
  info: "text-dim",
  ok: "text-cyan/80",
  junk: "text-violet line-through decoration-violet/50",
  error: "text-amber",
  voice: "text-amber/80",
};
const MARK: Record<LogLine["kind"], string> = { info: "›", ok: "+", junk: "×", error: "!", voice: "◦" };

export default function Ticker({ log, className = "" }: { log: LogLine[]; className?: string }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [log.length]);

  return (
    <div className={`thin-scroll overflow-y-auto text-[11px] leading-5 ${className}`} aria-live="polite">
      {log.map((line) => (
        <div key={line.id} className={`truncate whitespace-pre ${STYLE[line.kind]}`} title={line.text}>
          <span className="mr-2 opacity-60">{MARK[line.kind]}</span>
          {line.text}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
