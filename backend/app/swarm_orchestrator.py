from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import weave

from app.config import get_settings
from app.swarm_runtime import runtime


def _load_scenario() -> dict:
    scenario_dir = Path("app/scenarios/email_priority")
    emails = json.loads((scenario_dir / "emails.json").read_text(encoding="utf-8"))
    prompt = (scenario_dir / "prompt.md").read_text(encoding="utf-8")
    evaluation = (scenario_dir / "evaluation.md").read_text(encoding="utf-8")
    return {
        "emails": emails,
        "prompt": prompt,
        "evaluation": evaluation,
    }


@weave.op
async def run_sample_swarm(run_id: UUID) -> None:
    scenario = _load_scenario()
    model = get_settings().openrouter_model
    weave_project = get_settings().weave_project
    important_count = sum(
        1 for email in scenario["emails"]["emails"] if email["priority"] == "important"
    )

    runtime.add_run_event(
        run_id,
        agent_id="swarm",
        event_type="run_started",
        phase="bootstrap",
        content="Swarm run started with sample email prioritization scenario.",
        model=model,
        weave={
            "project": weave_project,
            "trace_id": f"trace-{run_id}",
            "call_id": f"call-{run_id}-0",
            "parent_call_id": "",
        },
    )

    steps = [
        (
            "brainstorming-agent",
            "reasoning_delta",
            "brainstorming",
            "Clarifying goal: prioritize urgent legal/compliance and payroll risks first.",
        ),
        (
            "multi-model-runner",
            "reasoning_delta",
            "execution",
            f"Running the prompt against synthetic inbox with {important_count} important emails.",
        ),
        (
            "judge-engine",
            "reasoning_delta",
            "evaluation",
            "Scoring summaries against factual grounding, priority ranking, and actionability.",
        ),
        (
            "aggregator",
            "reasoning_delta",
            "aggregation",
            "Combining quality, correctness, cost, and latency into composite scores.",
        ),
        (
            "report-generator",
            "reasoning_delta",
            "reporting",
            "Generating final markdown report and surfacing best model recommendation.",
        ),
    ]

    for idx, (agent_id, event_type, phase, content) in enumerate(steps, start=1):
        runtime.add_run_event(
            run_id,
            agent_id=agent_id,
            event_type=event_type,
            phase=phase,
            content=content,
            model=model,
            weave={
                "project": weave_project,
                "trace_id": f"trace-{run_id}",
                "call_id": f"call-{run_id}-{idx}",
                "parent_call_id": f"call-{run_id}-0",
            },
        )

    runtime.add_run_event(
        run_id,
        agent_id="swarm",
        event_type="run_completed",
        phase="done",
        content="Swarm run completed and artifacts captured.",
        model=model,
        weave={
            "project": weave_project,
            "trace_id": f"trace-{run_id}",
            "call_id": f"call-{run_id}-done",
            "parent_call_id": f"call-{run_id}-0",
        },
    )

    runtime.set_run_complete(run_id)
    runtime.write_sse_sample(run_id)
