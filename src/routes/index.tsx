import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

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

const API_BASE = "https://crescent-rag.onrender.com";

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

type AskResponse = { answer: string; sources: Source[]; conversation_id: string };

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
};

type ServerMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

function statusColor(status: string) {
  const s = status?.toLowerCase();
  if (s === "live") return "bg-emerald-500";
  if (s === "ongoing") return "bg-blue-500";
  if (s === "pending") return "bg-amber-500";
  if (s === "followup" || s === "follow-up" || s === "follow up") return "bg-red-500";
  return "bg-gray-400";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function Index() {
  const [input, setInput] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcodeDraft, setPasscodeDraft] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState(0);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, loading]);

  useEffect(() => {
    if (!loading) return;
    setLoadingIdx(0);
    const id = setInterval(
      () => setLoadingIdx((i) => (i + 1) % LOADING_MESSAGES.length),
      1400,
    );
    return () => clearInterval(id);
  }, [loading]);

  async function fetchConversations() {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: { "x-demo-passcode": passcode },
      });
      if (!res.ok) return;
      const data = (await res.json()) as Conversation[];
      setConversations(data);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (isUnlocked) fetchConversations();
  }, [isUnlocked]);

  async function createConversation(): Promise<string | null> {
    try {
      const res = await fetch(`${API_BASE}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-passcode": passcode },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as Conversation;
      setConversations((c) => [data, ...c.filter((x) => x.id !== data.id)]);
      return data.id;
    } catch {
      return null;
    }
  }

  async function handleNewChat() {
    setHistory([]);
    setError(null);
    setActivePreset(null);
    setInput("");
    const id = await createConversation();
    setActiveConvId(id);
  }

  async function renameConversation(id: string, title: string) {
    const newTitle = title.trim();
    if (!newTitle) {
      setRenamingId(null);
      return;
    }
    setConversations((cs) => cs.map((c) => (c.id === id ? { ...c, title: newTitle } : c)));
    setRenamingId(null);
    try {
      await fetch(`${API_BASE}/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-demo-passcode": passcode },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {
      /* ignore */
    }
  }

  async function deleteConversation(id: string) {
    setMenuOpenId(null);
    setConversations((cs) => cs.filter((c) => c.id !== id));
    if (id === activeConvId) {
      setActiveConvId(null);
      setHistory([]);
      setError(null);
      setActivePreset(null);
      setInput("");
    }
    try {
      await fetch(`${API_BASE}/conversations/${id}`, {
        method: "DELETE",
        headers: { "x-demo-passcode": passcode },
      });
    } catch {
      /* ignore */
    }
  }

  async function loadConversation(id: string) {
    setError(null);
    setActivePreset(null);
    setInput("");
    setActiveConvId(id);
    try {
      const res = await fetch(`${API_BASE}/conversations/${id}/messages`, {
        headers: { "x-demo-passcode": passcode },
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as ServerMessage[];
      setHistory(
        data.map((m) => ({
          role: m.role,
          content: m.content,
          sources: m.sources,
        })),
      );
    } catch {
      setError("Couldn't load that conversation.");
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let convId = activeConvId;
    if (!convId) {
      convId = await createConversation();
      if (convId) setActiveConvId(convId);
    }

    const historyForRequest = history;
    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-demo-passcode": passcode },
        body: JSON.stringify({
          question: q,
          passcode,
          history: historyForRequest,
          conversation_id: convId,
        }),
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        setIsUnlocked(false);
        setPasscode("");
        setPasscodeDraft("");
        setHistory([]);
        setActiveConvId(null);
        setConversations([]);
        setLockError("Invalid demo passcode. Please enter the access code again.");
        return;
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = (await res.json()) as AskResponse;
      if (data.conversation_id && data.conversation_id !== activeConvId) {
        setActiveConvId(data.conversation_id);
      }
      setHistory((h) => [
        ...h,
        { role: "user", content: q },
        { role: "assistant", content: data.answer, sources: data.sources },
      ]);
      setInput("");
      fetchConversations();
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

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    const code = passcodeDraft.trim();
    if (!code || verifying) return;
    setVerifying(true);
    setLockError(null);
    try {
      const res = await fetch(`${API_BASE}/verify-passcode`, {
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
    setHistory([]);
    setError(null);
    setActivePreset(null);
    setInput("");
    setActiveConvId(null);
    setConversations([]);
  }

  if (!isUnlocked) {
    return (
      <div className="flex min-h-screen flex-col bg-[oklch(0.985_0.002_247)] text-foreground">
        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5 py-8 sm:py-10">
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
          <form
            onSubmit={handleUnlock}
            className="mx-auto mt-16 flex w-full max-w-sm flex-col items-stretch gap-3"
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
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[oklch(0.985_0.002_247)] text-foreground">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-white transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-0"
        } overflow-hidden`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <button
            onClick={handleNewChat}
            className="flex-1 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition hover:opacity-90"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              No conversations yet
            </p>
          )}
          {conversations.map((c) => {
            const active = c.id === activeConvId;
            const isRenaming = renamingId === c.id;
            const isMenuOpen = menuOpenId === c.id;
            return (
              <div
                key={c.id}
                className={`group relative mb-1 flex items-center rounded-lg pr-1 transition ${
                  active ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary/60"
                }`}
              >
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onBlur={() => renameConversation(c.id, renameDraft)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameConversation(c.id, renameDraft);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="m-1 flex-1 rounded border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-foreground/40"
                  />
                ) : (
                  <button
                    onClick={() => loadConversation(c.id)}
                    className="flex flex-1 flex-col items-start gap-0.5 overflow-hidden rounded-lg px-3 py-2 text-left text-sm"
                  >
                    <span className="line-clamp-1 w-full text-sm">
                      {c.title || "Untitled"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.created_at)}
                    </span>
                  </button>
                )}
                {!isRenaming && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(isMenuOpen ? null : c.id);
                      }}
                      className={`rounded p-1 text-muted-foreground transition hover:bg-white hover:text-foreground ${
                        isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                      aria-label="Conversation options"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="1.6" />
                        <circle cx="12" cy="12" r="1.6" />
                        <circle cx="19" cy="12" r="1.6" />
                      </svg>
                    </button>
                    {isMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpenId(null)}
                        />
                        <div className="absolute right-0 top-full z-20 mt-1 w-32 overflow-hidden rounded-md border border-border bg-white shadow-md">
                          <button
                            onClick={() => {
                              setRenameDraft(c.title || "");
                              setRenamingId(c.id);
                              setMenuOpenId(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                          >
                            Rename
                          </button>
                          <button
                            onClick={() => deleteConversation(c.id)}
                            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-border p-2">
          <button
            onClick={handleChangePasscode}
            className="w-full rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
          >
            Change passcode
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-white/50 px-4 py-2">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Crescent Group · AI Memory
          </p>
        </div>

        <div className="mx-auto flex w-full max-w-[760px] flex-1 flex-col overflow-hidden px-5 py-6">
          <div className="space-y-1 pb-4">
            <h1 className="text-2xl font-semibold tracking-tight">
              Client Knowledge Assistant
            </h1>
            <p className="text-sm text-muted-foreground">
              Ask anything about the Pachranga account
            </p>
          </div>

          <div
            ref={threadRef}
            className="flex flex-1 flex-col overflow-y-auto rounded-xl border border-border bg-[oklch(0.985_0.002_247)] p-4"
          >
            {history.length === 0 && !loading && !error && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Ask a question to get started.
              </div>
            )}

            {history.map((m, idx) => {
              const isLast = idx === history.length - 1;
              const gapClass =
                m.role === "assistant" && !isLast ? "mb-4" : m.role === "user" ? "mb-3" : "";
              return m.role === "user" ? (
                <div key={idx} className={`flex justify-end ${gapClass}`}>
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-secondary px-4 py-3 text-sm text-foreground">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={idx} className={`flex flex-col items-start gap-2 ${gapClass}`}>
                  <div className="prose-chat max-w-[90%] rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                  {m.sources && m.sources.length > 0 && (
                    <div className="flex max-w-[90%] flex-wrap gap-2">
                      {m.sources.map((s, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-foreground"
                          title={`${s.status} · ${(s.similarity * 100).toFixed(0)}%`}
                        >
                          <span className={`h-2 w-2 rounded-full ${statusColor(s.status)}`} />
                          <span className="font-medium">{s.platform}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">{s.job}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground/60" />
                <span key={loadingIdx} className="animate-in fade-in">
                  {LOADING_MESSAGES[loadingIdx]}
                </span>
              </div>
            )}

            {error && !loading && (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {PRESETS.map((p) => {
              const active = activePreset === p;
              return (
                <button
                  key={p}
                  onClick={() => handlePreset(p)}
                  disabled={loading}
                  className={`w-full rounded-lg border px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-60 ${
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

          <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
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
        </div>
      </div>
    </div>
  );
}
