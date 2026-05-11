import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Crescent Memory · Client Knowledge Assistant" },
      {
        name: "description",
        content:
          "AI-powered client knowledge assistant for the Pachranga account at Crescent Group.",
      },
    ],
  }),
});

const PRESETS = [
  "What is the status of our active campaigns?",
  "What did the client say about the last creative?",
  "Any open blockers or revision requests this week?",
];

const LOADING_MESSAGES = [
  "Searching memory…",
  "Retrieving relevant context…",
  "Synthesising answer…",
];

type Source = {
  platform: string;
  job: string;
  status: string;
  similarity: number;
};

type AskResponse = { answer: string; sources: Source[] };

function statusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === "live") return "bg-emerald-500";
  if (s === "ongoing") return "bg-blue-500";
  if (s === "pending") return "bg-amber-500";
  if (s === "followup" || s === "follow-up" || s === "follow up") return "bg-red-500";
  return "bg-gray-400";
}

function Index() {
  const [input, setInput] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcodeDraft, setPasscodeDraft] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading) return;
    setLoadingIdx(0);
    const id = setInterval(
      () => setLoadingIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      1400,
    );
    return () => clearInterval(id);
  }, [loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setResponse(null);
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("https://crescent-rag.onrender.com/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, passcode }),
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        setIsUnlocked(false);
        setPasscode("");
        setPasscodeDraft("");
        setResponse(null);
        setLockError("Invalid demo passcode. Please enter the access code again.");
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AskResponse;
      setResponse(data);
    } catch (e: any) {
      if (e.name !== "AbortError")
        setError("Couldn't reach the memory service. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handlePreset(p: string) {
    setActivePreset(p);
    setInput(p);
    ask(p);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setActivePreset(null);
    ask(input);
  }

  const [verifying, setVerifying] = useState(false);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const code = passcodeDraft.trim();
    if (!code || verifying) return;
    setVerifying(true);
    setLockError(null);
    try {
      const res = await fetch("https://crescent-rag.onrender.com/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: code }),
      });
      if (res.status === 401) {
        setLockError("Invalid demo passcode. Please enter the access code again.");
        return;
      }
      if (!res.ok) {
        setLockError("Couldn't reach the memory service. Please try again.");
        return;
      }
      const data = (await res.json()) as { valid?: boolean };
      if (!data.valid) {
        setLockError("Invalid demo passcode. Please enter the access code again.");
        return;
      }
      setPasscode(code);
      setIsUnlocked(true);
    } catch {
      setLockError("Couldn't reach the memory service. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  function handleChangePasscode() {
    setIsUnlocked(false);
    setPasscode("");
    setPasscodeDraft("");
    setResponse(null);
    setError(null);
    setActivePreset(null);
    setInput("");
  }

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.002_247)] text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-14 sm:py-20">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Crescent Group · AI Memory
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Client Knowledge Assistant
          </h1>
          <p className="text-base text-muted-foreground">
            Ask anything about the Pachranga account
          </p>
        </div>

        {!isUnlocked ? (
          <form
            onSubmit={handleUnlock}
            className="mx-auto mt-16 flex max-w-sm flex-col items-stretch gap-3"
          >
            <label className="text-center text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Demo Passcode
            </label>
            <input
              type="password"
              value={passcodeDraft}
              onChange={(e) => setPasscodeDraft(e.target.value)}
              placeholder="Enter access code"
              autoFocus
              className="w-full rounded-lg border border-border bg-white px-4 py-3 text-center text-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5"
            />
            <button
              type="submit"
              disabled={!passcodeDraft.trim() || verifying}
              className="rounded-lg bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {verifying ? "Verifying…" : "Enter"}
            </button>
            {lockError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                {lockError}
              </div>
            )}
          </form>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-2">
              {PRESETS.map((p) => {
                const active = activePreset === p;
                return (
                  <button
                    key={p}
                    onClick={() => handlePreset(p)}
                    disabled={loading}
                    className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors disabled:opacity-60 ${
                      active
                        ? "border-foreground/30 bg-white text-foreground shadow-sm"
                        : "border-border bg-secondary text-foreground hover:bg-white"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <hr className="my-8 border-border" />

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setActivePreset(null);
                }}
                placeholder="Ask a question…"
                className="flex-1 rounded-lg border border-border bg-white px-4 py-3 text-sm outline-none transition focus:border-foreground/40 focus:ring-2 focus:ring-foreground/5"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-lg bg-foreground px-5 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-50"
              >
                Ask
              </button>
            </form>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handleChangePasscode}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Change passcode
              </button>
            </div>

            {loading && (
              <div className="mt-6 flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-4 text-sm text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground/60" />
                <span key={loadingIdx} className="animate-in fade-in">
                  {LOADING_MESSAGES[loadingIdx]}
                </span>
              </div>
            )}

            {error && !loading && (
              <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {response && !loading && (
              <div className="mt-6 rounded-xl border border-border bg-white p-5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Answer
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                  {response.answer}
                </p>

                <hr className="my-5 border-border" />

                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Sources
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {response.sources?.length ? (
                    response.sources.map((s, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs text-foreground"
                        title={`${s.status} · ${(s.similarity * 100).toFixed(0)}%`}
                      >
                        <span className={`h-2 w-2 rounded-full ${statusColor(s.status)}`} />
                        <span className="font-medium">{s.platform}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{s.job}</span>
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No sources returned.</span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
