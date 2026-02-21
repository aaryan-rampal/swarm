import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { prism } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Copy,
  Check,
  Trophy,
  Bolt,
  DollarSign,
  Target,
} from "lucide-react";
import { useApp, type JudgeSweepResult } from "../store";

const MODEL_META: Record<string, { name: string; color: string; provider: string }> = {
  "gpt-codex": { name: "GPT-Codex", color: "#10b981", provider: "OpenAI" },
  "claude-opus": { name: "Claude Opus", color: "#f97316", provider: "Anthropic" },
  "gemini-3-pro": { name: "Gemini 3 Pro", color: "#3b82f6", provider: "Google" },
  "kimi-25": { name: "Kimi 2.5", color: "#a855f7", provider: "Moonshot" },
};

const FALLBACK_SCORES = {
  "GPT-Codex": { correctness: 4.1, quality: 3.8, reasoning: 4.0, usability: 3.9, latency: 2156, cost: 0.032, tokens: 52000, composite: 4.02 },
  "Claude Opus": { correctness: 4.5, quality: 4.3, reasoning: 4.6, usability: 4.4, latency: 1823, cost: 0.045, tokens: 48000, composite: 4.42 },
  "Gemini 3 Pro": { correctness: 4.0, quality: 3.9, reasoning: 3.7, usability: 3.8, latency: 1245, cost: 0.018, tokens: 43000, composite: 3.88 },
  "Kimi 2.5": { correctness: 3.6, quality: 3.5, reasoning: 3.4, usability: 3.3, latency: 892, cost: 0.008, tokens: 38000, composite: 3.48 },
} as const;

interface ModelScoreRow {
  id: string;
  name: string;
  color: string;
  provider: string;
  correctness: number;
  quality: number;
  reasoning: number;
  usability: number;
  composite: number;
  latency: number;
  cost: number;
  tokens: number;
}

function buildScoreRows(judgeResult: JudgeSweepResult | null): ModelScoreRow[] {
  if (judgeResult && Object.keys(judgeResult.models).length > 0) {
    return Object.entries(judgeResult.models).map(([modelId, data]) => {
      const meta = MODEL_META[modelId] ?? { name: modelId, color: "#94a3b8", provider: "Unknown" };
      const s = data.scores;
      const composite = s.overall * 5;
      return {
        id: modelId,
        name: meta.name,
        color: meta.color,
        provider: meta.provider,
        correctness: s.correctness * 5,
        quality: s.quality * 5,
        reasoning: s.reasoning * 5,
        usability: s.usability * 5,
        composite: parseFloat(composite.toFixed(2)),
        latency: data.latency_ms,
        cost: 0,
        tokens: data.tokens_in + data.tokens_out,
      };
    }).sort((a, b) => b.composite - a.composite);
  }

  return Object.entries(FALLBACK_SCORES).map(([name, s]) => {
    const meta = Object.values(MODEL_META).find((m) => m.name === name) ?? { name, color: "#94a3b8", provider: "Unknown" };
    return {
      id: name,
      name: meta.name,
      color: meta.color,
      provider: meta.provider,
      correctness: s.correctness,
      quality: s.quality,
      reasoning: s.reasoning,
      usability: s.usability,
      composite: s.composite,
      latency: s.latency,
      cost: s.cost,
      tokens: s.tokens,
    };
  }).sort((a, b) => b.composite - a.composite);
}


function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="bg-arena-card border border-arena-border rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs font-medium text-arena-text mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

export default function ResultsPage() {
  const { judgeResult } = useApp();
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => buildScoreRows(judgeResult), [judgeResult]);
  const isLive = !!judgeResult && Object.keys(judgeResult.models).length > 0;

  const radarData = useMemo(() => [
    { metric: "Correctness", ...Object.fromEntries(rows.map((r) => [r.name, parseFloat(r.correctness.toFixed(1))])) },
    { metric: "Quality", ...Object.fromEntries(rows.map((r) => [r.name, parseFloat(r.quality.toFixed(1))])) },
    { metric: "Reasoning", ...Object.fromEntries(rows.map((r) => [r.name, parseFloat(r.reasoning.toFixed(1))])) },
    { metric: "Usability", ...Object.fromEntries(rows.map((r) => [r.name, parseFloat(r.usability.toFixed(1))])) },
  ], [rows]);

  const barData = useMemo(() => rows.map((r) => ({
    name: r.name,
    Correctness: parseFloat(r.correctness.toFixed(2)),
    Quality: parseFloat(r.quality.toFixed(2)),
    Reasoning: parseFloat(r.reasoning.toFixed(2)),
  })), [rows]);

  const bestRow = rows[0];
  const fastestRow = [...rows].sort((a, b) => a.latency - b.latency)[0];
  const bestModel = { name: bestRow.name, color: bestRow.color, provider: bestRow.provider };

  const dynamicReport = useMemo(() => {
    const rankingRows = rows.map((r, i) =>
      `| ${i + 1} | ${r.name} | ${r.composite.toFixed(2)} | ${r.correctness.toFixed(1)} | ${r.quality.toFixed(1)} | ${r.latency.toLocaleString()}ms | — |`
    ).join("\n");
    return `# Swarm Evaluation Report

## Task Summary

**Objective**: Build an agent that reads emails and summarizes the important ones
**Models Tested**: ${rows.length} | **Judged by**: ${isLive ? "Gemini 2.5 Flash (LLM-as-a-Judge)" : "Hardcoded fallback scores"}
**Eval Questions**: 35 yes/no questions across 4 categories

---

## Best Model: ${bestRow.name}

| Metric | Score |
|--------|-------|
| Composite Score | **${bestRow.composite.toFixed(2)} / 5.00** |
| Correctness | ${bestRow.correctness.toFixed(2)} |
| Quality | ${bestRow.quality.toFixed(2)} |
| Reasoning | ${bestRow.reasoning.toFixed(2)} |
| Usability | ${bestRow.usability.toFixed(2)} |
| Judge Latency | ${bestRow.latency.toLocaleString()} ms |

---

## Model Rankings

| Rank | Model | Composite | Correctness | Quality | Latency | Cost |
|------|-------|-----------|-------------|---------|---------|------|
${rankingRows}

---

## Evaluation Method

Each model response was evaluated by **Gemini 2.5 Flash** using 35 yes/no questions:

- **Correctness** (10 questions): Did it pick the right emails and rank them correctly?
- **Quality** (10 questions): Is the output well-structured, concise, scannable?
- **Reasoning** (10 questions): Is the prioritization logic sound?
- **Usability** (5 questions): Is the output actionable and professional?

Score = percentage of "yes" answers per category, scaled to 5.0.

---

*Generated by Swarm • ${rows.length} models evaluated • ${new Date().toLocaleDateString()}*
`;
  }, [rows, bestRow, isLive]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(dynamicReport);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {/* Winner Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl bg-gradient-to-br from-arena-card to-arena-surface border border-arena-border overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-orange-500/5 to-transparent rounded-bl-full" />
            <div className="relative p-8">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-arena-muted text-sm mb-2">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                    Best Model
                  </div>
                  <h2 className="text-3xl font-bold text-arena-text mb-1">
                    {bestModel.name}
                  </h2>
                  <p className="text-arena-muted text-sm">{bestModel.provider}</p>
                </div>
                <div className="text-right">
                  <div
                    className="text-4xl font-bold font-mono"
                    style={{ color: bestModel.color }}
                  >
                    {bestRow.composite.toFixed(2)}
                  </div>
                  <div className="text-arena-muted text-sm">/ 5.00 composite</div>
                </div>
              </div>
              {isLive && (
                <div className="mt-3 text-xs text-arena-accent font-medium">
                  Scored by Gemini 2.5 Flash (LLM-as-a-Judge)
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                {[
                  { label: "Most Accurate", value: bestRow.name, detail: bestRow.correctness.toFixed(2), icon: Target, color: bestRow.color },
                  { label: "Fastest", value: fastestRow.name, detail: `${fastestRow.latency}ms`, icon: Bolt, color: fastestRow.color },
                  { label: "Best Reasoning", value: [...rows].sort((a, b) => b.reasoning - a.reasoning)[0].name, detail: [...rows].sort((a, b) => b.reasoning - a.reasoning)[0].reasoning.toFixed(2), icon: DollarSign, color: [...rows].sort((a, b) => b.reasoning - a.reasoning)[0].color },
                  { label: "Best Usability", value: [...rows].sort((a, b) => b.usability - a.usability)[0].name, detail: [...rows].sort((a, b) => b.usability - a.usability)[0].usability.toFixed(2), icon: Target, color: [...rows].sort((a, b) => b.usability - a.usability)[0].color },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-arena-bg/50 border border-arena-border/50 p-4"
                  >
                    <div className="flex items-center gap-1.5 text-arena-muted text-xs mb-2">
                      <item.icon className="w-3 h-3" />
                      {item.label}
                    </div>
                    <div className="text-sm font-semibold text-arena-text">
                      {item.value}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: item.color }}>
                      {item.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-2xl bg-arena-card border border-arena-border p-6"
            >
              <h3 className="text-sm font-semibold text-arena-text mb-4">
                Multi-Dimensional Comparison
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis
                    dataKey="metric"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                  />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 5]}
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    tickCount={6}
                  />
                  {rows.map((r) => (
                    <Radar
                      key={r.name}
                      name={r.name}
                      dataKey={r.name}
                      stroke={r.color}
                      fill={r.color}
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Bar Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-2xl bg-arena-card border border-arena-border p-6"
            >
              <h3 className="text-sm font-semibold text-arena-text mb-4">
                Score Breakdown
              </h3>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={barData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <YAxis
                    domain={[0, 5]}
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    axisLine={{ stroke: "#e2e8f0" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Correctness" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Quality" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Reasoning" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Metrics Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl bg-arena-card border border-arena-border overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-arena-border">
              <h3 className="text-sm font-semibold text-arena-text">
                Detailed Metrics
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-arena-border">
                    <th className="text-left px-6 py-3 text-arena-muted font-medium text-xs">
                      Model
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Composite
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Correctness
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Quality
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Reasoning
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Latency
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Cost
                    </th>
                    <th className="text-left px-4 py-3 text-arena-muted font-medium text-xs">
                      Tokens
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const isWinner = i === 0;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-arena-border/50 ${isWinner ? "bg-orange-500/5" : ""}`}
                      >
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className="text-arena-muted text-xs font-mono w-4">
                              {i + 1}
                            </span>
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: r.color,
                                boxShadow: `0 0 6px ${r.color}`,
                              }}
                            />
                            <span className="font-medium text-arena-text">
                              {r.name}
                            </span>
                            {isWinner && (
                              <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-semibold" style={{ color: r.color }}>
                          {r.composite.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {r.correctness.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {r.quality.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {r.reasoning.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {r.latency.toLocaleString()}ms
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          —
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {r.tokens.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Markdown Report */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="rounded-2xl bg-arena-card border border-arena-border overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-arena-border">
              <div>
                <h3 className="text-sm font-semibold text-arena-text">
                  Full Report
                </h3>
                <p className="text-xs text-arena-muted mt-0.5">
                  Copy this markdown and paste into Cursor
                </p>
              </div>
              <button
                onClick={handleCopy}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                  copied
                    ? "bg-arena-green/20 text-arena-green border border-arena-green/30"
                    : "bg-arena-accent/20 text-arena-accent border border-arena-accent/30 hover:bg-arena-accent/30"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Report
                  </>
                )}
              </button>
            </div>
            <div className="px-8 py-8 prose prose-base max-w-none [&>*+*]:mt-6 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-arena-text [&_h1]:mt-10 [&_h1]:mb-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-arena-text [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-arena-border [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-arena-text/90 [&_h3]:mt-6 [&_h3]:mb-3 [&_p]:text-arena-text/75 [&_p]:leading-7 [&_p]:my-4 [&_li]:text-arena-text/75 [&_li]:leading-7 [&_li]:my-1 [&_ul]:my-4 [&_ul]:space-y-1 [&_ol]:my-4 [&_strong]:text-arena-text [&_strong]:font-semibold [&_a]:text-arena-blue [&_a]:underline [&_a]:underline-offset-2 [&_hr]:border-arena-border [&_hr]:my-8 [&_em]:text-arena-muted [&_table]:w-full [&_table]:my-6 [&_table]:text-sm [&_th]:text-left [&_th]:px-4 [&_th]:py-3 [&_th]:border-b-2 [&_th]:border-arena-border [&_th]:text-arena-text [&_th]:font-medium [&_td]:px-4 [&_td]:py-3 [&_td]:border-b [&_td]:border-arena-border/40 [&_td]:text-arena-text/75 [&_blockquote]:border-l-2 [&_blockquote]:border-arena-accent/30 [&_blockquote]:pl-4 [&_blockquote]:text-arena-muted [&_blockquote]:italic">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    const inline = !match;
                    return inline ? (
                      <code
                        className="bg-arena-card text-arena-accent px-1.5 py-0.5 rounded text-[13px] font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <SyntaxHighlighter
                        style={prism}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          background: "#f5f4f0",
                          borderRadius: "0.75rem",
                          border: "1px solid #e8e6e1",
                          fontSize: "0.82rem",
                          padding: "1.25rem 1.5rem",
                          lineHeight: "1.7",
                          margin: "1.5rem 0",
                        }}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    );
                  },
                }}
              >
                {dynamicReport}
              </ReactMarkdown>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
