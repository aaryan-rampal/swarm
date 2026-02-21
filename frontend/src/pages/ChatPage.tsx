import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Sparkles, Check } from "lucide-react";
import { useApp } from "../store";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  isPlan?: boolean;
}

const WELCOME_MSG =
  "Hey! I'm **Swarm** — your AI prompt benchmarking assistant.\n\nDescribe the agent or task you want to build, and I'll test it across multiple models to find the best one for you.\n\nWhat would you like to build?";

const CLARIFYING_MSG = `That's an excellent use case! To design the best evaluation, I need a few details:

1. **Scale** — How many items should the agent handle per run? (small batch, medium, large-scale)
2. **Priority** — What matters most to you: accuracy, speed, or cost?
3. **Output format** — Do you prefer bullet points, short paragraphs, or structured JSON?

This helps me create better synthetic test data and evaluation criteria.`;

const PROMPT_MSG = `Here's the exact prompt that will be sent to each model:

\`\`\`
You are an expert email triage assistant. Given a set of emails, identify the top 3 most important ones and provide a concise bullet-point summary for each.

Importance Criteria:
- Sender authority (manager, executive, key stakeholder)
- Time sensitivity (deadlines, urgent requests)
- Action required (tasks, decisions, approvals)
- Business impact (revenue, customers, critical systems)

For each important email, provide:
- Subject line
- Sender
- Why it's important (1 sentence)
- Key action items (bullet points)
- Suggested priority level (Critical / High / Medium)

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
          setMessages((prev) => [...prev, { role: "assistant", content, isPlan }]);
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
    }, 500);
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

  const handleApprove = () => {
    navigate("/swarm");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-arena-border bg-arena-surface/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arena-accent to-arena-blue flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-lg font-semibold text-white tracking-tight">
            Swarm
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-arena-muted">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Multi-model prompt benchmarking</span>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6">
        <div className="max-w-3xl mx-auto min-w-0 space-y-4">
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
                      ? "bg-arena-accent/20 border border-arena-accent/30 text-white"
                      : msg.isPlan
                        ? "bg-arena-surface border border-arena-border"
                        : "bg-arena-card border border-arena-border"
                  }`}
                >
                  <div className="prose prose-invert prose-sm max-w-none break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-arena-border [&_td]:p-2 [&_td]:border-b [&_td]:border-arena-border/50 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-base [&_h3]:text-white/90 [&_strong]:text-white [&_p]:text-arena-text/90 [&_li]:text-arena-text/90">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.isPlan && phase === "ready" && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-4 pt-4 border-t border-arena-border"
                    >
                      <button
                        onClick={handleApprove}
                        className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-arena-accent to-arena-blue text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        Start Swarm
                      </button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator / streaming content */}
          {typingIdx >= 0 && displayedContent && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] min-w-0 rounded-2xl px-5 py-3.5 bg-arena-card border border-arena-border overflow-hidden">
                <div className="prose prose-invert prose-sm max-w-none break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:w-full [&_th]:text-left [&_th]:p-2 [&_th]:border-b [&_th]:border-arena-border [&_td]:p-2 [&_td]:border-b [&_td]:border-arena-border/50 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-base [&_h3]:text-white/90 [&_strong]:text-white [&_p]:text-arena-text/90 [&_li]:text-arena-text/90">
                  <ReactMarkdown>{displayedContent}</ReactMarkdown>
                </div>
              </div>
            </motion.div>
          )}

          {isTyping && !displayedContent && (
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

      {/* Input */}
      <div className="px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end bg-arena-card border border-arena-border rounded-2xl focus-within:border-arena-accent/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                phase === "welcome"
                  ? "Describe the agent you want to build..."
                  : phase === "clarifying"
                    ? "Answer the questions above..."
                    : "Type a message..."
              }
              disabled={isTyping || phase === "ready" || phase === "planning"}
              rows={1}
              className="flex-1 bg-transparent text-white placeholder:text-arena-muted px-5 py-4 resize-none focus:outline-none disabled:opacity-50 text-sm"
              style={{ maxHeight: 120 }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || phase === "ready"}
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
