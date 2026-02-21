from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import UUID

import weave

from app.config import get_settings
from app.openrouter_client import chat_completion_stream
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


def _build_reasoning_messages(scenario: dict[str, Any]) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are a rigorous inbox triage assistant. Think through priority"
                " ranking carefully and produce concise action-oriented conclusions."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{scenario['prompt']}\n\n"
                "Inbox dataset JSON:\n"
                f"{json.dumps(scenario['emails'])}\n\n"
                "Evaluation rubric:\n"
                f"{scenario['evaluation']}"
            ),
        },
    ]


def _reasoning_text(reasoning_details: list[dict[str, Any]]) -> str:
    first = reasoning_details[0]
    if first.get("type") == "reasoning.summary":
        return first.get("summary", "Reasoning summary chunk.")
    if first.get("type") == "reasoning.text":
        return first.get("text", "Reasoning text chunk.")
    return json.dumps(first)


@weave.op
def _trace_stream_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    return chunk


@weave.op
async def run_sample_swarm(run_id: UUID) -> None:
    scenario = _load_scenario()
    settings = get_settings()
    model = settings.openrouter_reasoning_model
    weave_project = settings.weave_project
    trace_id = f"trace-{run_id}"
    root_call_id = f"call-{run_id}-0"

    runtime.add_run_event(
        run_id,
        agent_id="swarm",
        event_type="run_started",
        phase="bootstrap",
        content="Swarm run started with sample email prioritization scenario.",
        model=model,
        weave={
            "project": weave_project,
            "trace_id": trace_id,
            "call_id": root_call_id,
            "parent_call_id": "",
        },
    )

    chunk_index = 0
    stream_messages = _build_reasoning_messages(scenario)
    try:
        async for chunk in chat_completion_stream(
            messages=stream_messages,
            model=model,
            reasoning={"enabled": True, "exclude": False, "max_tokens": 4096},
        ):
            if chunk.get("done"):
                continue

            chunk_index += 1
            traced_chunk = _trace_stream_chunk(chunk)

            content_delta = traced_chunk.get("content_delta")
            if content_delta:
                runtime.add_run_event(
                    run_id,
                    agent_id="multi-model-runner",
                    event_type="llm_content_delta",
                    phase="execution",
                    content=content_delta,
                    model=model,
                    weave={
                        "project": weave_project,
                        "trace_id": trace_id,
                        "call_id": f"call-{run_id}-content-{chunk_index}",
                        "parent_call_id": root_call_id,
                    },
                    chunk_index=chunk_index,
                    content_delta=content_delta,
                )

            reasoning_details = traced_chunk.get("reasoning_details") or []
            if reasoning_details:
                runtime.add_run_event(
                    run_id,
                    agent_id="multi-model-runner",
                    event_type="llm_reasoning_delta",
                    phase="execution",
                    content=_reasoning_text(reasoning_details),
                    model=model,
                    weave={
                        "project": weave_project,
                        "trace_id": trace_id,
                        "call_id": f"call-{run_id}-reasoning-{chunk_index}",
                        "parent_call_id": root_call_id,
                    },
                    chunk_index=chunk_index,
                    reasoning_details=reasoning_details,
                )

            usage = traced_chunk.get("usage")
            if usage:
                runtime.add_run_event(
                    run_id,
                    agent_id="multi-model-runner",
                    event_type="llm_usage_final",
                    phase="usage",
                    content="Captured token usage from OpenRouter stream.",
                    model=model,
                    weave={
                        "project": weave_project,
                        "trace_id": trace_id,
                        "call_id": f"call-{run_id}-usage-{chunk_index}",
                        "parent_call_id": root_call_id,
                    },
                    chunk_index=chunk_index,
                    usage=usage,
                )
    except Exception as exc:
        runtime.add_run_event(
            run_id,
            agent_id="multi-model-runner",
            event_type="error",
            phase="execution",
            content=f"OpenRouter streaming failed: {exc}",
            model=model,
            weave={
                "project": weave_project,
                "trace_id": trace_id,
                "call_id": f"call-{run_id}-error",
                "parent_call_id": root_call_id,
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
            "trace_id": trace_id,
            "call_id": f"call-{run_id}-done",
            "parent_call_id": root_call_id,
        },
    )

    runtime.set_run_complete(run_id)
    runtime.write_sse_sample(run_id)
