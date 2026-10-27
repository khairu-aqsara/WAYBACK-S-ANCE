import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, fmtDay, type Citation, type SnapshotPages } from "../api";

export interface DrawerTarget {
  ts: string;
  citation?: Citation;
}

interface Props {
  siteId?: string;
  target: DrawerTarget | null;
  digests: Record<string, string>;
  onClose: () => void;
}

export default function Drawer({ siteId, target, digests, onClose }: Props) {
  const [data, setData] = useState<SnapshotPages | null>(null);
  const [failed, setFailed] = useState(false);
  const mark = useRef<HTMLElement>(null);

  useEffect(() => {
    setData(null);
    setFailed(false);
    if (!siteId || !target) return;
    api.snapshot(siteId, target.ts).then(setData, () => setFailed(true));
  }, [siteId, target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data]);

  const passage = target?.citation?.text;
  const hit = data && passage ? data.pages.find((p) => p.text.includes(passage)) : undefined;
  const page = hit ?? data?.pages[0];
  const memory = target && !hit ? (target.citation?.text ?? digests[target.ts]) : undefined;
  const host = data ? data.original.replace(/^https?:\/\//, "").split("/")[0] : "";

  return (
    <AnimatePresence>
      {target && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label={`Snapshot ${fmtDay(target.ts)}`}
            className="crt fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[440px] flex-col border-l border-amber/30"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
          >
            <header className="flex items-start justify-between border-b border-amber/20 px-6 py-5">
              <div>
                <div className="text-[10px] tracking-[0.4em] text-dim">SNAPSHOT</div>
                <div className="glow-amber mt-1 font-display text-2xl tracking-widest text-amber">{fmtDay(target.ts)}</div>
                <div className="mt-1 text-xs text-dim">{page?.page ?? "/"}</div>
              </div>
              <button onClick={onClose} className="text-xs tracking-[0.3em] text-dim hover:text-amber" aria-label="Close">
                CLOSE
              </button>
            </header>

            <div className="thin-scroll flex-1 overflow-y-auto px-6 py-5 text-[12.5px] leading-6 text-ink/80">
              {memory && (
                <div className="mb-6 border-l-2 border-amber/60 pl-4 text-amber/90">
                  <div className="mb-1 text-[10px] tracking-[0.4em] text-dim">MEMORY</div>
                  {memory}
                </div>
              )}
              {failed && <p className="text-violet">This snapshot could not be read.</p>}
              {!data && !failed && <p className="animate-pulse text-dim">tuning in…</p>}
              {page &&
                (hit && passage ? (
                  <p>
                    {page.text.slice(0, page.text.indexOf(passage))}
                    <mark ref={mark} className="bg-amber/20 text-amber shadow-[0_0_0_2px_rgb(255_179_71/0.2)]">
                      {passage}
                    </mark>
                    {page.text.slice(page.text.indexOf(passage) + passage.length)}
                  </p>
                ) : (
                  <p>{page.text}</p>
                ))}
            </div>

            {data && (
              <footer className="border-t border-amber/20 px-6 py-4 text-[11px] tracking-widest">
                <a
                  href={`https://web.archive.org/web/${target.ts}/${host}${page?.page ?? "/"}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan hover:underline"
                >
                  OPEN IN THE WAYBACK MACHINE ↗
                </a>
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
