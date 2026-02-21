# Swarm

## Overview
Swarm is a large-scale reasoning trace evaluation platform that runs 10-20 LLMs across multiple providers with 5 repetitions per prompt, captures full reasoning traces, and automatically evaluates reasoning quality.

## Agent Architecture

### 1. Eval Designer (Spec Generation Agent)
**Purpose**: Generates universal prompts and judging criteria for benchmark execution.

**Input**:
- Task description
- Dataset
- Tool list
- Providers/models to test
- Run counts

**Output**: JSON Benchmark Spec containing:
- Universal prompt (provider-agnostic)
- Global judging criteria (cost, latency, tool correctness, format compliance)
- Task-specific rubric items
- JSON schema convertible to Weave eval criteria

**Key Responsibilities**:
- Create consistent, provider-agnostic prompt template
- Define machine-checkable criteria (JSON validation, required fields, tool calls)
- Generate LLM-judge rubrics with explicit scales and anchors
- Specify failure modes and disqualifiers

---

### 2. Multi-Model Runner Agent
**Purpose**: Executes benchmarks across 10-20 models with 5 repetitions each.

**Input**:
- Universal prompt from Eval Designer
- Dataset
- List of models/providers
- Configuration (temperature, seeds, repetitions)

**Output**:
- Stored results for each run:
  ```json
  {
    "prompt": "...",
    "reasoning_trace": "...",
    "final_answer": "...",
    "tokens_in": 1200,
    "tokens_out": 800,
    "latency_ms": 1500,
    "cost_usd": 0.012
  }
  ```

**Key Responsibilities**:
- Parallel execution across providers
- Capture reasoning traces (explicit CoT or hidden scratchpad)
- Track metrics: latency, tokens, cost, timestamps
- Support providers: OpenAI, Anthropic, Gemini, Azure, OpenRouter, Vertex

**Execution**: 
- 20 prompts × 5 repetitions = 100 runs per model
- 20 models = 2,000 total evaluations
- Uses asyncio.gather for parallelization

---

### 3. Judge Engine Agent
**Purpose**: Evaluates reasoning quality using hybrid deterministic + LLM-judge scoring.

**Two-Level Evaluation**:

**A. Final Answer Quality**:
- Correctness
- Completeness
- Factuality

**B. Reasoning Trace Quality**:
- Logical coherence
- Internal consistency
- Evidence usage
- Hallucination detection
- Step validity

**Output**:
```json
{
  "correctness_score": 0.85,
  "reasoning_score": 0.78,
  "hallucination_flag": false,
  "justification": "..."
}
```

**Judging Criteria**:

**Global Metrics**:
- Cost (USD, tokens, cost per correct answer)
- Latency (p50, p95)
- Tool correctness (allowed tools, correct arguments)
- Format compliance (strict JSON, required fields)
- Safety/Policy gates (auto-fail if violated)

**Task Rubric**:
- Correctness (0-10 scale, weight 0.4)
- Tooling quality (hybrid checks, weight 0.2)
- Reasoning trace quality (0-10 scale, weight 0.3)
- Evidence usage (0-10 scale, weight 0.1)

**Deterministic Checks**:
- JSON validity
- Required fields present
- Tool calls match allowed tools
- Citations present
- Output format compliance

---

### 4. Aggregator Agent
**Purpose**: Computes statistical metrics across multiple runs to measure stability and consistency.

**Input**: Results from Judge Engine (5 runs per prompt per model)

**Output per model**:

**Performance Metrics**:
- Mean accuracy
- Mean reasoning score
- Failure rate
- Hallucination %

**Stability Metrics**:
- Variance across 5 runs
- Score standard deviation
- Trace similarity score

**Efficiency Metrics**:
- Cost per run
- Cost per correct answer
- Tokens per reasoning step
- Time to first token
- Total latency

**Composite Score Formula**:
```
Composite = 0.4 * correctness
          + 0.4 * reasoning_quality
          + 0.1 * consistency
          - 0.1 * hallucination_penalty
```

---

### 5. Weave Integration Agent
**Purpose**: Compiles benchmark spec into Weave eval hooks and mirrors traces for visualization.

**Input**:
- JSON Benchmark Spec from Eval Designer
- Evaluation results from Runner + Judge

**Output**:
- Weave trace captures
- Eval function mappings
- Metadata for leaderboard

**Integration Strategy**:
1. Use Weave for trace capture + visualization
2. Keep benchmark spec provider-agnostic in backend
3. Write "compiler" to convert scoring into Weave eval hooks
4. Optionally mirror traces into Weave for demo explorer

**Minimal Integration** (for hackathon):
- Store everything in Postgres + custom leaderboard UI
- Optionally "mirror" traces into Weave for wow-factor trace explorer
- Avoid locking into Weave's exact evaluator model

---

## Agent Orchestration Flow

```
1. Eval Designer
   ↓ (Benchmark Spec JSON)

2. Multi-Model Runner
   ↓ (Results for each run)

3. Judge Engine (parallel)
   ↓ (Scores + justifications)

4. Aggregator
   ↓ (Statistical metrics)

5. Frontend Dashboard
   ↓
   Leaderboard, Trace Explorer, Charts
```

**Parallel Execution**:
- Runner executes all models in parallel
- Judge engine evaluates results in parallel
- Aggregator computes final metrics

---

## Tech Stack

**Backend**:
- FastAPI (Python)
- LiteLLM (multi-provider abstraction)
- Postgres (Supabase) for results storage
- Redis for async job queue
- asyncio for parallel execution

**Frontend**:
- Next.js 14 (App Router)
- TailwindCSS + shadcn/ui
- React Query
- Recharts/Tremor for visualization

**Infra**:
- Vercel (frontend)
- Railway/Render (backend)
- Supabase (database + auth)

---

## Killer Differentiators

1. **Multi-run consistency evaluation** – Most benchmarks test once; we test 5x to measure reliability
2. **Cross-provider reasoning trace comparison** – Compare GPT-4o vs Claude vs Gemini side-by-side at trace level
3. **Automated reasoning quality scoring** – LLM-judge evaluates logical coherence, hallucination, step validity
4. **Statistical benchmarking** – Aggregate metrics (mean, std dev, worst-case, consistency scores)
5. **Cost-quality frontier** – Pareto graph showing best tradeoffs

---

## Demo Narrative

"Most benchmarks test final answers once. We evaluate reasoning reliability across stochastic runs and providers."

Demo flow:
1. Upload incident dataset
2. Eval Designer generates spec + universal prompt
3. Run benchmark across 20 models (5 repetitions each)
4. Watch leaderboards populate live
5. Show: same prompt, 5 traces from same model, reveal inconsistency
6. Compare against another provider
7. Show cost-quality frontier graph
8. Dive into trace explorer for side-by-side reasoning

---

## Potential Names

- TraceArena
- OmniBench
- TraceForge
- EvalForge
- BenchStack
- ReasonRank

**Recommended**: TraceArena (competitive, hackathon energy)
