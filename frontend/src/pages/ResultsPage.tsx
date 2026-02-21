import { useState } from "react";
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

const MODELS = [
  { name: "GPT-Codex", color: "#10b981", provider: "OpenAI" },
  { name: "Claude Opus", color: "#f97316", provider: "Anthropic" },
  { name: "Gemini 3 Pro", color: "#3b82f6", provider: "Google" },
  { name: "Kimi 2.5", color: "#a855f7", provider: "Moonshot" },
];

const SCORES = {
  "GPT-Codex": { correctness: 4.1, quality: 3.8, reasoning: 4.0, latency: 2156, cost: 0.032, tokens: 52000, composite: 4.02 },
  "Claude Opus": { correctness: 4.5, quality: 4.3, reasoning: 4.6, latency: 1823, cost: 0.045, tokens: 48000, composite: 4.42 },
  "Gemini 3 Pro": { correctness: 4.0, quality: 3.9, reasoning: 3.7, latency: 1245, cost: 0.018, tokens: 43000, composite: 3.88 },
  "Kimi 2.5": { correctness: 3.6, quality: 3.5, reasoning: 3.4, latency: 892, cost: 0.008, tokens: 38000, composite: 3.48 },
} as const;

type ModelName = keyof typeof SCORES;

const radarData = [
  { metric: "Correctness", ...Object.fromEntries(MODELS.map((m) => [m.name, SCORES[m.name as ModelName].correctness])) },
  { metric: "Quality", ...Object.fromEntries(MODELS.map((m) => [m.name, SCORES[m.name as ModelName].quality])) },
  { metric: "Reasoning", ...Object.fromEntries(MODELS.map((m) => [m.name, SCORES[m.name as ModelName].reasoning])) },
  {
    metric: "Speed",
    ...Object.fromEntries(
      MODELS.map((m) => [m.name, parseFloat((5 - (SCORES[m.name as ModelName].latency / 2200) * 5).toFixed(1))])
    ),
  },
  {
    metric: "Cost Efficiency",
    ...Object.fromEntries(
      MODELS.map((m) => [m.name, parseFloat((5 - (SCORES[m.name as ModelName].cost / 0.05) * 5).toFixed(1))])
    ),
  },
];

const barData = MODELS.map((m) => ({
  name: m.name,
  Correctness: SCORES[m.name as ModelName].correctness,
  Quality: SCORES[m.name as ModelName].quality,
  Reasoning: SCORES[m.name as ModelName].reasoning,
}));

const REPORT = `# Swarm Evaluation Report

## Task Summary

**Objective**: Build an agent that reads emails and summarizes the important ones
**Models Tested**: 4 | **Total Evaluations**: 400 | **Synthetic Test Cases**: 20

---

## Best Model: Claude Opus

| Metric | Score |
|--------|-------|
| Composite Score | **4.42 / 5.00** |
| Correctness | 4.50 |
| Quality | 4.30 |
| Reasoning | 4.60 |
| Avg Latency | 1,823 ms |
| Cost per Call | $0.045 |

---

## Model Rankings

| Rank | Model | Composite | Correctness | Quality | Latency | Cost |
|------|-------|-----------|-------------|---------|---------|------|
| 1 | Claude Opus | 4.42 | 4.50 | 4.30 | 1,823ms | $0.045 |
| 2 | GPT-Codex | 4.02 | 4.10 | 3.80 | 2,156ms | $0.032 |
| 3 | Gemini 3 Pro | 3.88 | 4.00 | 3.90 | 1,245ms | $0.018 |
| 4 | Kimi 2.5 | 3.48 | 3.60 | 3.50 | 892ms | $0.008 |

---

## Best Value Picks

- **Most Accurate**: Claude Opus (4.50 correctness)
- **Fastest**: Kimi 2.5 (892ms avg latency)
- **Most Affordable**: Kimi 2.5 ($0.008/call)
- **Best Balance**: GPT-Codex (strong scores, moderate cost)

---

## Optimized Prompt Template

\`\`\`text
You are an expert email triage assistant. Given a set of emails, identify the
top 3 most important ones and provide a concise bullet-point summary for each.

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
\`\`\`

---

## Evaluation Criteria

### Correctness (50% weight)
- Did the agent identify the correct top 3 most important emails?
- Were importance rankings justified?

### Quality (30% weight)
- Are summaries concise and actionable?
- Is the formatting consistent and readable?

### Reasoning (10% weight)
- Is the reasoning trace logical?
- Does the agent explain why emails were prioritized?

### Cost Penalty (10% weight)
- Higher cost models receive a small penalty
- Formula: \`composite = 0.5 * correctness + 0.3 * quality + 0.1 * reasoning - 0.1 * cost_penalty\`

---

## Weave Integration

All evaluation traces are available in the Weave dashboard:
- [View Traces](https://wandb.ai/swarm/eval-traces)
- [Compare Models](https://wandb.ai/swarm/model-comparison)

---

## Cursor Instructions

1. Copy the optimized prompt template above
2. Set your model to **Claude Opus** (\`anthropic/claude-opus\`)
3. Paste into Cursor's AI chat or your agent code
4. Configure with your email API credentials
5. Run and iterate!

---

*Generated by Swarm • 400 evaluations across 4 models • Feb 21, 2026*
`;

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
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(REPORT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const bestModel = MODELS[1]; // Claude Opus

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
                    4.42
                  </div>
                  <div className="text-arena-muted text-sm">/ 5.00 composite</div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
                {[
                  { label: "Most Accurate", value: "Claude Opus", detail: "4.50", icon: Target, color: "#f97316" },
                  { label: "Fastest", value: "Kimi 2.5", detail: "892ms", icon: Bolt, color: "#a855f7" },
                  { label: "Most Affordable", value: "Kimi 2.5", detail: "$0.008", icon: DollarSign, color: "#a855f7" },
                  { label: "Best Balance", value: "GPT-Codex", detail: "4.02", icon: Target, color: "#10b981" },
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
                  {MODELS.map((m) => (
                    <Radar
                      key={m.name}
                      name={m.name}
                      dataKey={m.name}
                      stroke={m.color}
                      fill={m.color}
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
                  {MODELS.map((m, i) => {
                    const s = SCORES[m.name as ModelName];
                    const isWinner = m.name === "Claude Opus";
                    return (
                      <tr
                        key={m.name}
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
                                background: m.color,
                                boxShadow: `0 0 6px ${m.color}`,
                              }}
                            />
                            <span className="font-medium text-arena-text">
                              {m.name}
                            </span>
                            {isWinner && (
                              <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono font-semibold" style={{ color: m.color }}>
                          {s.composite.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {s.correctness.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {s.quality.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {s.reasoning.toFixed(1)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {s.latency.toLocaleString()}ms
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          ${s.cost.toFixed(3)}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-arena-text/80">
                          {s.tokens.toLocaleString()}
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
                {REPORT}
              </ReactMarkdown>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
