import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import { useApp } from "../store";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  isPlan?: boolean;
}

const WELCOME_MSG =
  "Describe the agent or task you want to build, and I'll test it across multiple models to find the best one for you.";

const CLARIFYING_MSG = `Great choice. A few quick questions to sharpen the evaluation:

1. **Scale** — How many items per run? (small / medium / large)
2. **Priority** — Accuracy, speed, or cost?
3. **Output** — Bullet points, paragraphs, or JSON?`;

const PROMPT_MSG = `Here's the prompt each model will receive:

\`\`\`
You are an expert email triage assistant. Given a set of emails, identify the top 3 most important ones and provide a concise summary for each.

Criteria:
- Sender authority (manager, executive, stakeholder)
- Time sensitivity (deadlines, urgent requests)
- Action required (tasks, decisions, approvals)
- Business impact (revenue, customers, systems)

For each email, provide:
- Subject line & sender
- Why it's important (1 sentence)
- Action items (bullet points)
- Priority level (Critical / High / Medium)

Input emails:
{{emails}}
\`\`\``;

type Phase = "welcome" | "clarifying" | "planning" | "ready";

export default function ChatPage() {
  const navigate = useNavigate();
  const { setUserPrompt } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("welcome");
  const [isTyping, setIsTyping] = useState(false);
  const [displayedContent, setDisplayedContent] = useState("");
  const [typingIdx, setTypingIdx] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, displayedContent, scrollToBottom]);

  const typeMessage = useCallback(
    (content: string, isPlan: boolean, nextPhase: Phase) => {
      setIsTyping(true);
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
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content, isPlan },
          ]);
          setIsTyping(false);
          setPhase(nextPhase);
        } else {
          setDisplayedContent(content.slice(0, i));
        }
      }, 12);
    },
    [messages.length]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      typeMessage(WELCOME_MSG, false, "welcome");
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isTyping) return;
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    if (phase === "welcome") {
      setUserPrompt(text);
      setTimeout(() => typeMessage(CLARIFYING_MSG, false, "clarifying"), 600);
    } else if (phase === "clarifying") {
      setTimeout(() => typeMessage(PROMPT_MSG, true, "ready"), 600);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent =
    messages.length > 0 || typingIdx >= 0 || displayedContent;

  const proseClasses =
    "prose prose-sm max-w-none break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto [&_pre]:bg-arena-surface [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-arena-text/80 [&_pre]:text-[13px] [&_code]:break-words [&_code]:text-[13px] [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-arena-text [&_h3]:text-sm [&_h3]:text-arena-text/90 [&_strong]:text-arena-text [&_strong]:font-medium [&_p]:text-arena-text/80 [&_p]:leading-relaxed [&_li]:text-arena-text/80 [&_li]:leading-relaxed";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!hasContent ? (
          <div className="h-full flex flex-col items-center justify-center px-6 pb-32">
            <h2
              className="text-4xl text-arena-text/80 text-center leading-snug"
              style={{ fontFamily: "var(--font-serif)", fontWeight: 400 }}
            >
              What would you like to build?
            </h2>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-10 min-w-0">
            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`mb-6 ${msg.role === "user" ? "flex justify-end" : ""}`}
                >
                  {msg.role === "user" ? (
                    <div className="inline-block max-w-[80%] rounded-2xl px-5 py-3 bg-arena-text text-white/90 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-full">
                      <div className={proseClasses}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {msg.isPlan && phase === "ready" && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="mt-6"
                        >
                          <button
                            onClick={() => navigate("/swarm")}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-arena-text text-white text-sm font-medium hover:bg-arena-text/90 transition-colors cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Start Swarm
                          </button>
                        </motion.div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {typingIdx >= 0 && displayedContent && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <div className={proseClasses}>
                  <ReactMarkdown>{displayedContent}</ReactMarkdown>
                </div>
              </motion.div>
            )}

            {isTyping && !displayedContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-6"
              >
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-arena-muted/50 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-arena-muted/50 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-arena-muted/50 animate-bounce [animation-delay:300ms]" />
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 px-6 pb-6 pt-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 bg-white border border-arena-border rounded-xl px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus-within:border-arena-muted/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your agent..."
              disabled={isTyping || phase === "ready" || phase === "planning"}
              rows={1}
              className="flex-1 bg-transparent text-arena-text placeholder:text-arena-muted/60 resize-none focus:outline-none disabled:opacity-40 text-sm leading-relaxed min-w-0"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || phase === "ready"}
              className="p-2 rounded-lg text-arena-muted hover:text-arena-text disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
