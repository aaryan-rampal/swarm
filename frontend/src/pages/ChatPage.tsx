import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Check } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  isPlan?: boolean;
}

const WELCOME_MSG =
  "Hey! I'm **Swarm** — your AI prompt benchmarking assistant.\n\nDescribe the agent or task you want to build, and I'll test it across multiple models to find the best one for you.\n\nWhat would you like to build?";

interface PlannerMessageResponse {
  assistant_message: string;
  ready_to_confirm: boolean;
  draft_prompt: string;
}

interface PlannerConfirmResponse {
  run_id: string;
  status: string;
  sse_sample_path: string;
}

export default function ChatPage() {
  const navigate = useNavigate();
  const {
    setUserPrompt,
    sessionId,
    setSessionId,
    setRunId,
  } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [readyToConfirm, setReadyToConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayedContent, setDisplayedContent] = useState("");
  const [typingIdx, setTypingIdx] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, displayedContent, scrollToBottom]);

  const typeMessage = useCallback(
    (content: string, isPlan: boolean) => {
      setDisplayedContent("");
      const targetIdx = messages.length;
      setTypingIdx(targetIdx);

      let i = 0;
      const speed = isPlan ? 3 : 5;
      const interval = setInterval(() => {
        i += speed;
        if (i >= content.length) {
          clearInterval(interval);
          setDisplayedContent("");
          setTypingIdx(-1);
          setMessages((prev) => [...prev, { role: "assistant", content, isPlan }]);
        } else {
          setDisplayedContent(content.slice(0, i));
        }
      }, 12);
    },
    [messages.length]
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const res = await api.post<{ session_id: string; status: string }>(
          "/api/planner/sessions",
          {}
        );
        if (!cancelled && res.session_id) {
          setSessionId(res.session_id);
          setMessages([{ role: "assistant", content: WELCOME_MSG }]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to start session");
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [setSessionId]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading || !sessionId) return;

    setUserPrompt(text);
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const res = await api.post<PlannerMessageResponse>(
        `/api/planner/sessions/${sessionId}/messages`,
        { message: text }
      );
      setReadyToConfirm(res.ready_to_confirm);
      const isPlan = res.ready_to_confirm && res.draft_prompt.length > 0;
      typeMessage(res.assistant_message, isPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApprove = async () => {
    if (!sessionId || isConfirming || !readyToConfirm) return;

    setIsConfirming(true);
    setError(null);

    try {
      const res = await api.post<PlannerConfirmResponse>(
        `/api/planner/sessions/${sessionId}/confirm`,
        {}
      );
      setRunId(res.run_id);
      navigate("/swarm", { state: { runId: res.run_id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start swarm");
      setIsConfirming(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-arena-border bg-arena-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arena-accent to-arena-blue flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-black tracking-tight">
            Swarm
          </h1>
        </div>
        <div className="text-xs text-arena-muted">
          Multi-model prompt benchmarking
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div className="max-w-3xl mx-auto min-w-0 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          <AnimatePresence mode="popLayout">
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] min-w-0 rounded-2xl px-5 py-3.5 overflow-hidden ${
                    msg.role === "user"
                      ? "bg-arena-accent/20 border border-arena-accent/30 text-black"
                      : msg.isPlan
                        ? "bg-arena-surface border border-arena-border"
                        : "bg-arena-card border border-arena-border"
                  }`}
                >
                  <div className="prose prose-sm max-w-none break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-arena-border [&_td]:p-2 [&_td]:border-b [&_td]:border-arena-border/50 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-black [&_h3]:text-base [&_h3]:text-black/90 [&_strong]:text-black [&_p]:text-arena-text/90 [&_li]:text-arena-text/90">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.isPlan && readyToConfirm && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-4 pt-4 border-t border-arena-border"
                    >
                      <button
                        onClick={handleApprove}
                        disabled={isConfirming}
                        className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-arena-accent to-arena-blue text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        {isConfirming ? "Starting..." : "Start Swarm"}
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {typingIdx >= 0 && displayedContent && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] min-w-0 rounded-2xl px-5 py-3.5 bg-arena-card border border-arena-border overflow-hidden">
                <div className="prose prose-sm max-w-none break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-arena-border [&_td]:p-2 [&_td]:border-b [&_td]:border-arena-border/50 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-black [&_h3]:text-base [&_h3]:text-black/90 [&_strong]:text-black [&_p]:text-arena-text/90 [&_li]:text-arena-text/90">
                  <ReactMarkdown>{displayedContent}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          )}

          {isLoading && !displayedContent && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="rounded-2xl px-5 py-3.5 bg-arena-card border border-arena-border">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-arena-muted animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 rounded-full bg-arena-muted animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-arena-muted animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end bg-arena-card border border-arena-border rounded-2xl focus-within:border-arena-accent/50 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                !sessionId
                  ? "Connecting..."
                  : "Describe the agent you want to build..."
              }
              disabled={!sessionId || isLoading || readyToConfirm}
              rows={1}
              className="flex-1 bg-transparent text-black placeholder:text-arena-muted px-5 py-4 resize-none focus:outline-none disabled:opacity-50 text-sm"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading || readyToConfirm || !sessionId}
              className="m-2 p-2.5 rounded-xl bg-arena-accent text-white disabled:opacity-30 hover:bg-arena-accent/80 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-xs text-arena-muted mt-3">
            Swarm generates synthetic test data and evaluates across
            multiple AI models
          </p>
        </div>
      </div>
    </div>
  );
}
