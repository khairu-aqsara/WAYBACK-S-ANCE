import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { api, type Citation, type SeanceResult } from "../api";
import Typed, { type CiteHandlers } from "./Typed";

interface Message {
  id: number;
  role: "visitor" | "site";
  text: string;
  citations: Citation[];
  refused?: boolean;
  pending?: boolean;
}

interface Props extends CiteHandlers {
  siteId: string;
  url: string;
  years: [string, string] | null;
  remembered: number;
  seance: SeanceResult;
  ready: boolean;
}

const SUGGESTIONS = ["What were you?", "Who came to visit you?", "What happened at the end?", "What was your favourite colour?"];

export default function Transcript({ siteId, url, years, remembered, seance, ready, ...handlers }: Props) {
  const [spoken, setSpoken] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  // Follow the text as it types, unless the reader has scrolled up.
  useEffect(() => {
    const box = scroller.current;
    if (!box || !content.current) return;
    const observer = new ResizeObserver(() => {
      if (box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
    });
    observer.observe(content.current);
    return () => observer.disconnect();
  }, []);

  const busy = messages.some((m) => m.pending);
  const canAsk = spoken && ready && !busy;

  async function ask(text: string) {
    const q = text.trim();
    if (!q || !canAsk) return;
    setQuestion("");
    const visitorId = ++nextId.current;
    const siteMsgId = ++nextId.current;
    setMessages((m) => [
      ...m,
      { id: visitorId, role: "visitor", text: q, citations: [] },
      { id: siteMsgId, role: "site", text: "", citations: [], pending: true },
    ]);
    let reply: Message;
    try {
      const answer = await api.ask(siteId, q);
      reply = { id: siteMsgId, role: "site", text: answer.answer, citations: answer.citations, refused: answer.refused };
    } catch (err) {
      reply = { id: siteMsgId, role: "site", text: (err as Error).message, citations: [], refused: true };
    }
    setMessages((m) => m.map((msg) => (msg.id === siteMsgId ? reply : msg)));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    ask(question);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 sm:px-10">
        <div ref={content} className="mx-auto max-w-3xl pb-10 pt-6">
          <motion.header
            initial={{ opacity: 0, filter: "blur(12px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.4, delay: 0.6 }}
            className="mb-8"
          >
            <div className="mb-2 text-[10px] tracking-[0.4em] text-dim">THE SPIRIT OF</div>
            <h1 className="flicker glow-amber break-all font-display text-4xl font-light tracking-[0.12em] text-amber sm:text-6xl">
              {url}
            </h1>
            {years && (
              <div className="mt-3 text-xs tracking-[0.25em] text-dim">
                {years[0]} <span className="text-violet">—</span> {years[1]} · {remembered} SNAPSHOTS REMEMBERED
              </div>
            )}
          </motion.header>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
            <Typed
              text={seance.text}
              citations={seance.citations}
              onDone={() => setSpoken(true)}
              className="text-[15px] leading-8 text-amber/90"
              {...handlers}
            />
          </motion.div>

          {messages.map((m) =>
            m.role === "visitor" ? (
              <div key={m.id} className="mt-10 text-sm text-cyan">
                <span className="mr-3 text-cyan/50">›</span>
                {m.text}
              </div>
            ) : m.pending ? (
              <div key={m.id} className="mt-4 flex items-center gap-3 text-xs tracking-[0.3em] text-dim">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-amber"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </span>
                THE MEDIUM IS LISTENING
              </div>
            ) : (
              <Typed
                key={m.id}
                text={m.text}
                citations={m.citations}
                className={`mt-4 text-[15px] leading-8 ${m.refused ? "italic text-violet" : "text-amber/90"}`}
                {...handlers}
              />
            ),
          )}
        </div>
      </div>

      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: spoken ? 1 : 0.25, y: 0 }}
        className="border-t border-line bg-void/80 px-6 py-4 backdrop-blur sm:px-10"
      >
        <div className="mx-auto max-w-3xl">
          {spoken && messages.length === 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  disabled={!canAsk}
                  className="border border-line px-3 py-1 text-[11px] text-dim transition hover:border-cyan/50 hover:text-cyan disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <label className="flex items-center gap-3 border border-line bg-panel/70 px-4 py-3 focus-within:border-cyan/50 focus-within:shadow-[0_0_24px_rgb(95_242_255/0.12)]">
            <span className="text-cyan">›</span>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!spoken || !ready}
              maxLength={500}
              placeholder={spoken ? `Ask ${url} something` : "Wait. It is still speaking."}
              className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-dim"
              aria-label="Question for the site"
            />
            <button disabled={!canAsk || !question.trim()} className="text-[11px] tracking-[0.3em] text-cyan disabled:text-dim">
              ASK
            </button>
          </label>
        </div>
      </motion.form>
    </div>
  );
}
