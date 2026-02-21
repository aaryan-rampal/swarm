from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any
from uuid import UUID

import weave

from app.config import get_settings
from app.eval_questions import eval_questions_to_markdown, validate_eval_questions
from app.model_registry import ModelSpec
from app.openrouter_client import chat_completion_stream
from app.swarm_runtime import runtime

_MAX_CONCURRENCY = 10

_DEFAULT_EVALUATION = (
    "Evaluate the output for correctness, relevance, and quality."
)


def normalize_spec(spec: dict[str, Any]) -> dict[str, Any]:
    """Normalize arbitrary planner JSON to canonical {prompt, input_data, evaluation, eval_questions}."""
    prompt = spec.get("prompt_template") or spec.get("prompt")
    if not prompt:
        raise ValueError("Spec must contain 'prompt_template' or 'prompt'")
    raw_input = (
        spec.get("input_data")
        or spec.get("emails")
        or spec.get("data")
        or {}
    )
    # If planner outputs a top-level array, wrap it into a generic object
    input_data = {"items": raw_input} if isinstance(raw_input, list) else raw_input

    eval_questions: list[dict[str, str]] | None = None
    if "eval_questions" in spec and spec["eval_questions"] is not None:
        eval_questions = validate_eval_questions(spec["eval_questions"])

    evaluation = (
        spec.get("evaluation")
        or spec.get("rubric")
        or (eval_questions_to_markdown(eval_questions) if eval_questions else None)
        or _DEFAULT_EVALUATION
    )

    result: dict[str, Any] = {
        "prompt": prompt,
        "input_data": input_data,
        "evaluation": evaluation,
    }
    if eval_questions is not None:
        result["eval_questions"] = eval_questions
    return result


def _load_scenario() -> dict[str, Any]:
    scenario_dir = Path("app/scenarios/email_priority")
    emails = json.loads((scenario_dir / "emails.json").read_text(encoding="utf-8"))
    prompt = (scenario_dir / "prompt.md").read_text(encoding="utf-8")
    evaluation = (scenario_dir / "evaluation.md").read_text(encoding="utf-8")
    return {
        "prompt": prompt,
        "input_data": emails,
        "evaluation": evaluation,
    }


def _build_messages(scenario: dict[str, Any]) -> list[dict[str, str]]:
    input_data = scenario.get("input_data") or {}
    return [
        {
            "role": "system",
            "content": (
                "You are a rigorous assistant. Narrate what you are doing out loud"
                " while you analyze. Speak in natural first-person commentary,"
                " concise but explicit, grounded only in the provided data and rubric."
            ),
        },
        {
            "role": "user",
            "content": (
                f"{scenario['prompt']}\n\n"
                "Input data:\n"
                f"{json.dumps(input_data)}\n\n"
                "Evaluation rubric:\n"
                f"{scenario['evaluation']}"
            ),
        },
    ]


@weave.op
async def _run_single_model(
    run_id: UUID,
    model: ModelSpec,
    rep_index: int,
    messages: list[dict[str, str]],
    semaphore: asyncio.Semaphore,
) -> dict[str, Any]:
    """Run one model for one repetition. Streams response, accumulates full text."""
    settings = get_settings()
    weave_project = settings.weave_project
    trace_id = f"trace-{run_id}-{model.id}-{rep_index}"
    call_prefix = f"call-{run_id}-{model.id}-{rep_index}"

    tag = dict(model_id=model.id, rep_index=rep_index)

    runtime.add_run_event(
        run_id,
        agent_id="multi-model-runner",
        event_type="model_run_started",
        phase="execution",
        content=f"Starting {model.name} rep {rep_index}",
        model=model.id,
        weave={"project": weave_project, "trace_id": trace_id, "call_id": f"{call_prefix}-start", "parent_call_id": ""},
        **tag,
    )

    accumulated_text = ""
    chunk_count = 0
    usage_payload: dict[str, Any] | None = None
    t0 = time.monotonic()

    async with semaphore:
        try:
            async for chunk in chat_completion_stream(
                messages=messages,
                model=model.id,
            ):
                if chunk.get("done"):
                    continue

                chunk_count += 1
                content_delta = chunk.get("content_delta")
                if content_delta:
                    accumulated_text += content_delta
                    runtime.add_run_event(
                        run_id,
                        agent_id="multi-model-runner",
                        event_type="narration_delta",
                        phase="execution",
                        content=content_delta,
                        model=model.id,
                        weave={"project": weave_project, "trace_id": trace_id, "call_id": f"{call_prefix}-chunk-{chunk_count}", "parent_call_id": ""},
                        chunk_index=chunk_count,
                        content_delta=content_delta,
                        **tag,
                    )

                usage = chunk.get("usage")
                if usage:
                    usage_payload = usage

        except Exception as exc:
            latency_ms = int((time.monotonic() - t0) * 1000)
            runtime.add_run_event(
                run_id,
                agent_id="multi-model-runner",
                event_type="model_run_error",
                phase="execution",
                content=f"Error on {model.name} rep {rep_index}: {exc}",
                model=model.id,
                weave={"project": weave_project, "trace_id": trace_id, "call_id": f"{call_prefix}-error", "parent_call_id": ""},
                **tag,
            )
            result = {
                "model_id": model.id,
                "rep_index": rep_index,
                "status": "error",
                "error": str(exc),
                "latency_ms": latency_ms,
                "output": accumulated_text,
                "usage": None,
            }
            runtime.set_model_result(run_id, model.id, rep_index, result)
            return result

    latency_ms = int((time.monotonic() - t0) * 1000)

    runtime.add_run_event(
        run_id,
        agent_id="multi-model-runner",
        event_type="model_run_completed",
        phase="execution",
        content=f"Completed {model.name} rep {rep_index} ({latency_ms}ms, {chunk_count} chunks)",
        model=model.id,
        weave={"project": weave_project, "trace_id": trace_id, "call_id": f"{call_prefix}-done", "parent_call_id": ""},
        usage=usage_payload,
        **tag,
    )

    result = {
        "model_id": model.id,
        "rep_index": rep_index,
        "status": "completed",
        "output": accumulated_text,
        "latency_ms": latency_ms,
        "usage": usage_payload,
        "chunks": chunk_count,
        "weave_trace_id": trace_id,
    }
    runtime.set_model_result(run_id, model.id, rep_index, result)
    return result


@weave.op
async def run_swarm(
    run_id: UUID,
    models: list[ModelSpec],
    reps: int = 5,
    spec: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Run all models x reps in parallel. Returns list of per-run results."""
    settings = get_settings()
    weave_project = settings.weave_project
    if spec is not None:
        scenario = normalize_spec(spec)
    else:
        scenario = _load_scenario()
    messages = _build_messages(scenario)
    semaphore = asyncio.Semaphore(_MAX_CONCURRENCY)

    total_tasks = len(models) * reps

    runtime.add_run_event(
        run_id,
        agent_id="swarm",
        event_type="run_started",
        phase="bootstrap",
        content=f"Swarm started: {len(models)} models x {reps} reps = {total_tasks} tasks",
        model="swarm",
        weave={"project": weave_project, "trace_id": f"trace-{run_id}", "call_id": f"call-{run_id}-start", "parent_call_id": ""},
    )

    tasks = [
        _run_single_model(run_id, model, rep, messages, semaphore)
        for rep in range(reps)
        for model in models
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    collected: list[dict[str, Any]] = []
    for r in results:
        if isinstance(r, Exception):
            collected.append({"status": "exception", "error": str(r)})
        else:
            collected.append(r)

    completed = sum(1 for r in collected if r.get("status") == "completed")
    errored = total_tasks - completed

    runtime.add_run_event(
        run_id,
        agent_id="swarm",
        event_type="run_completed",
        phase="done",
        content=f"Swarm finished: {completed}/{total_tasks} succeeded, {errored} errors",
        model="swarm",
        weave={"project": weave_project, "trace_id": f"trace-{run_id}", "call_id": f"call-{run_id}-done", "parent_call_id": ""},
    )

    runtime.set_run_complete(run_id)
    return collected
