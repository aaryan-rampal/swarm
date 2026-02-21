# Swarm

## Overview
OmniTrace is a prompt benchmarking platform. Input a task (e.g., "summarize my top 3 most important emails"), and it:
1. Generates synthetic data + judging criteria + optimized prompt
2. Runs the prompt across 20 models (5 reps each) via OpenRouter
3. Evaluates results and aggregates metrics
4. Outputs a markdown report for one-shotting into Cursor
## Agent Architecture

### 1. Brainstorming Agent
**Purpose**: Generates synthetic test data, judging criteria, and optimized prompt from a user's task description.

**Input**:
- User task description (e.g., "summarize my top 3 most important emails")
- Specialized system prompt for brainstorming

**Output**:
- `synthetic_data.json`: Test cases for evaluation
- `judging_criteria.json`: Evaluation rubric and metrics
- `prompt_template.md`: Optimized prompt template
- `weave_eval_config.py`: Weave eval function configuration

**Key Responsibilities**:
- Design realistic synthetic data that covers edge cases
- Define clear, machine-checkable evaluation criteria
- Create a prompt template that works across providers
- Generate Weave-compatible eval scoring functions

**System Prompt Focus**:
- Think like a prompt engineer
- Consider failure modes and edge cases
- Design criteria that align with user intent
- Make criteria LLM-judge friendly

---

### 2. Multi-Model Runner Agent
**Purpose**: Executes the prompt across 20 models (5 repetitions each) via OpenRouter.

**Input**:
- Synthetic data from Brainstorming Agent
- Prompt template from Brainstorming Agent
- List of 20 models to test

**Output**:
- Stored results for each run (100 runs per model):
  ```json
  {
    "model": "openai/gpt-4o",
    "prompt": "...",
    "input_data": {...},
    "output": "...",
    "reasoning_trace": "...",
    "tokens_in": 1200,
    "tokens_out": 800,
    "latency_ms": 1500,
    "cost_usd": 0.012
  }
  ```

**Key Responsibilities**:
- Parallel execution via OpenRouter routing
- Capture reasoning traces (explicit CoT or hidden scratchpad)
- Track metrics: latency, tokens, cost, timestamps
- All model calls go through OpenRouter for unified routing

**Execution**: 
- 20 synthetic cases × 5 repetitions = 100 runs per model
- 20 models = 2,000 total evaluations
- Uses asyncio.gather for parallelization

---

### 3. Judge Engine Agent
**Purpose**: Evaluates outputs against judging criteria using Weave eval framework.

**Input**:
- Results from Multi-Model Runner
- Judging criteria from Brainstorming Agent

**Output per run**:
```json
{
  "correctness_score": 0.85,
  "quality_score": 0.78,
  "trace_score": 0.90,
  "composite_score": 0.82,
  "justification": "..."
}
```

**Judging Categories**:
- **Correctness**: Did the output meet requirements?
- **Quality**: Is the output well-structured and useful?
- **Reasoning Trace**: Is the reasoning logical and coherent?

**Implementation**:
- Weave eval functions for deterministic checks
- LLM-judge for subjective scoring
- Composite score calculation

---

### 4. Aggregator Agent
**Purpose**: Computes statistical metrics and selects the best model.

**Input**: Scored results from Judge Engine

**Output**:

**Global Metrics** (across all prompts ever evaluated):
- Model reliability rankings
- Cost-performance trends
- Latency distributions
- Cross-model consistency

**Prompt-Specific Metrics** (for current task):
- Mean correctness per model
- Mean quality per model
- Mean composite score
- Cost per correct answer
- Tokens used per answer
- Latency p50/p95

**Best Model Selection**:
```python
composite = 0.5 * correctness + 0.3 * quality + 0.1 * reasoning - 0.1 * cost_penalty
```

---

### 5. Report Generator Agent
**Purpose**: Outputs a markdown document ready to paste into Cursor.

**Input**:
- Aggregated metrics from Aggregator
- Synthetic data and prompt template from Brainstorming Agent
- Top model recommendation

**Output**: Markdown document containing:
- **Task Summary**: What was tested
- **Best Model**: Recommended model with composite score
- **Optimized Prompt**: The prompt template that worked best
- **Evaluation Criteria**: How results were judged
- **Sample Synthetic Data**: Test cases used
- **Metrics Table**:
  - Model rankings (correctness, quality, cost, latency)
  - Best value picks (fastest, cheapest, most accurate)
- **Weave Integration**: Links to trace viewer in Weave
- **Cursor Instructions**: How to one-shot the best prompt

---

## Agent Orchestration Flow

```
1. User Input Task
   ↓ "summarize my top 3 most important emails"

2. Brainstorming Agent
   ↓ (synthetic_data.json, judging_criteria.json, prompt_template.md)

3. Multi-Model Runner (parallel across 20 models)
   ↓ (2,000 results with traces and metrics)

4. Judge Engine (parallel via Weave)
   ↓ (scored results with justifications)

5. Aggregator
   ↓ (global metrics + prompt metrics + best model)

6. Report Generator
   ↓
   Markdown document → Paste into Cursor
```

---

## Tech Stack

**Backend**:
- FastAPI (Python)
- OpenRouter SDK for unified routing across providers
- Weave (wandb) for eval framework and trace capture
- asyncio for parallel execution

**Frontend**:
- React + TypeScript
- Vite
- Visualization libraries for criteria + agent swarm observability

**Infra**:
- Weave for trace storage and visualization
- OpenRouter for LLM routing

---

## Killer Differentiators

1. **Zero-shot prompt testing** – No manual prompt engineering, just describe the task
2. **Auto-generated synthetic data** – LLM creates realistic test cases automatically
3. **Multi-model reliability** – Test 20 models (5 reps each) to find the best one
4. **Cursor-ready output** – Get a complete markdown report you can paste and run
5. **Weave trace replay** – Full reasoning traces saved for debugging in Weave UI

---

## Demo Narrative

"I want to test which AI is best at summarizing my emails, but I don't have time to write prompts and test 20 models."

Demo flow:
1. Type: "summarize my top 3 most important emails"
2. Brainstorming Agent generates synthetic email data + evaluation rubric + prompt
3. Runner executes across 20 models (GPT-4o, Claude 3.5, Gemini, etc.) with 5 repetitions each
4. Watch Weave traces populate live
5. Get markdown report: "Best model: Claude 3.5 Sonnet (92% accuracy, $0.03/email)"
6. Copy the optimized prompt
7. Paste into Cursor with the recommended model
8. One-shot the actual task

---

## Potential Names

- PromptArena
- BenchMVP
- AutoPrompt
- PromptForge
- EvalStack
- PromptRank

**Recommended**: PromptArena (competitive, hackathon energy)
