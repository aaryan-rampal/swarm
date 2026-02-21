from __future__ import annotations

import asyncio
import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

logger = logging.getLogger(__name__)

from pydantic import BaseModel

from app.agents.judge_agent import (
    EVAL_QUESTIONS,
    HARDCODED_RESPONSES,
    judge_single_response,
    run_judge_sweep,
)
from app.model_registry import (
    DEFAULT_MODEL_IDS,
    load_available_models,
    load_models,
    models_from_ids,
)
from app.schemas import (
    AnalysisChatRequest,
    AnalysisChatResponse,
    JudgeModelResult,
    JudgeQuestionResult,
    JudgeSweepResponse,
    LeaderboardEntry,
    ModelBreakdown,
    ModelStatus,
    PromptBreakdownResponse,
    RunEvent,
    RunEventsResponse,
    RunMetricsResponse,
    RunResultsResponse,
    RunStatusResponse,
    StartRunRequest,
    StartRunResponse,
)
from app.swarm_orchestrator import run_swarm
from app.swarm_runtime import runtime

router = APIRouter()

_runs: dict[str, dict] = {}


@router.get("/questions")
async def get_eval_questions() -> list[dict[str, str]]:
    return EVAL_QUESTIONS


def _spec_to_dict(m):
    return {"id": m.id, "name": m.name, "provider": m.provider, "color": m.color}


@router.get("/available-models")
async def get_available_models():
    """Return every model from available_models.txt plus the default selection."""
    all_models = load_available_models()
    return {
        "models": [_spec_to_dict(m) for m in all_models],
        "default_ids": DEFAULT_MODEL_IDS,
    }


class StartSwarmRequest(BaseModel):
    model_ids: list[str] | None = None
    session_id: str | None = None


@router.post("/start")
async def start_swarm_run(payload: StartSwarmRequest | None = None):
    """Create a new swarm run, kick it off in the background, and return immediately."""
    if payload and payload.model_ids:
        models = models_from_ids(payload.model_ids)
    else:
        models = load_models()

    spec: dict | None = None
    if payload and payload.session_id:
        try:
            planner_session = runtime.get_session(UUID(payload.session_id))
            spec = planner_session.get("draft_spec")
        except (KeyError, ValueError):
            pass

    session = runtime.create_session()
    run = runtime.create_run(session["session_id"])
    run_id = run["run_id"]

    asyncio.create_task(run_swarm(run_id, models, spec=spec))

    return {
        "run_id": str(run_id),
        "models": [_spec_to_dict(m) for m in models],
    }


@router.post("", response_model=StartRunResponse)
async def start_run(payload: StartRunRequest) -> StartRunResponse:
    run_id = uuid4()
    _runs[str(run_id)] = {"status": "running", "result": None}

    async def _run_in_background(rid: str) -> None:
        try:
            result = await run_judge_sweep()
            _runs[rid] = {"status": "completed", "result": result}
        except Exception as exc:
            _runs[rid] = {"status": "failed", "error": str(exc), "result": None}

    asyncio.create_task(_run_in_background(str(run_id)))
    return StartRunResponse(run_id=run_id, status="running")


@router.post("/judge", response_model=JudgeSweepResponse)
async def run_judge() -> JudgeSweepResponse:
    """Run the LLM judge sweep across all models synchronously and return results."""
    logger.info("Starting judge sweep...")
    result = await run_judge_sweep()
    logger.info("Judge sweep done: %d models scored", len(result.get("models", {})))

    models_out: dict[str, JudgeModelResult] = {}
    for model_id, data in result["models"].items():
        questions = [
            JudgeQuestionResult(
                id=q["id"],
                category=q["category"],
                question=q["question"],
                answer=data["answers"].get(q["id"], "no"),
            )
            for q in EVAL_QUESTIONS
        ]
        models_out[model_id] = JudgeModelResult(
            model_id=model_id,
            scores=data["scores"],
            answers=data["answers"],
            questions=questions,
            latency_ms=data["latency_ms"],
            tokens_in=data["tokens_in"],
            tokens_out=data["tokens_out"],
            judge_model=data["judge_model"],
        )

    return JudgeSweepResponse(
        models=models_out,
        ranking=result["ranking"],
        best_model=result["best_model"],
    )


@router.get("/{run_id}", response_model=RunStatusResponse)
async def get_run_status(run_id: UUID) -> RunStatusResponse:
    if run_id in runtime.runs:
        run = runtime.runs[run_id]
        results = runtime.get_results(run_id)
        total = len(results) if results else 0
        completed = sum(1 for r in results.values() if r.get("status") == "completed")
        return RunStatusResponse(
            status=run["status"],
            progress=completed / total * 100 if total else 0.0,
            total_tasks=total,
            completed_tasks=completed,
        )
    run = _runs.get(str(run_id))
    if not run:
        return RunStatusResponse(status="unknown", progress=0.0, total_tasks=0, completed_tasks=0)
    done = run["status"] == "completed"
    total = len(HARDCODED_RESPONSES)
    return RunStatusResponse(
        status=run["status"],
        progress=1.0 if done else 0.5,
        total_tasks=total,
        completed_tasks=total if done else 0,
    )


@router.get("/{run_id}/models", response_model=list[ModelStatus])
async def get_run_models(run_id: UUID) -> list[ModelStatus]:
    run = _runs.get(str(run_id))
    if not run or not run.get("result"):
        return [
            ModelStatus(model=mid, avg_score=0.0, completed=0, total=1)
            for mid in HARDCODED_RESPONSES
        ]
    result = run["result"]
    return [
        ModelStatus(
            model=mid,
            avg_score=data["scores"]["overall"],
            completed=1,
            total=1,
        )
        for mid, data in result["models"].items()
    ]


@router.get("/{run_id}/results", response_model=RunResultsResponse)
async def get_run_results(
    run_id: UUID,
    model: str | None = Query(default=None),
    prompt_id: int | None = Query(default=None),
) -> RunResultsResponse:
    return RunResultsResponse(prompt="Email triage: summarize top 3 important emails", runs=[])


@router.get("/{run_id}/events", response_model=RunEventsResponse)
async def get_run_events(
    run_id: UUID,
    cursor: str | None = Query(default=None),
    model_id: str | None = Query(default=None),
) -> RunEventsResponse:
    if run_id not in runtime.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    events = runtime.get_events(run_id, cursor=cursor, model_id=model_id)
    response_events = [RunEvent(**event) for event in events]
    next_cursor = response_events[-1].cursor if response_events else cursor
    return RunEventsResponse(events=response_events, next_cursor=next_cursor)


@router.get("/{run_id}/stream")
async def stream_run_events(run_id: UUID) -> StreamingResponse:
    if run_id not in runtime.runs:
        raise HTTPException(status_code=404, detail="Run not found")

    queue: asyncio.Queue = runtime.runs[run_id]["queue"]

    async def event_stream():
        while True:
            event = await queue.get()
            if event.get("_sentinel"):
                break
            yield runtime.to_sse_block(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(run_id: UUID) -> list[LeaderboardEntry]:
    run = _runs.get(str(run_id))
    if not run or not run.get("result"):
        return []
    result = run["result"]
    entries = []
    for mid in result["ranking"]:
        data = result["models"][mid]
        entries.append(LeaderboardEntry(
            model=mid,
            mean_score=data["scores"]["overall"],
            std_dev=0.0,
            hallucination_rate=0.0,
            cost_total=0.0,
            latency_p50=data["latency_ms"],
        ))
    return entries


@router.get("/{run_id}/metrics", response_model=RunMetricsResponse)
async def get_run_metrics(run_id: UUID) -> RunMetricsResponse:
    return RunMetricsResponse(
        cost_vs_score=[],
        stability_data=[],
        hallucination_rates=[],
    )


@router.get("/{run_id}/prompts/{prompt_id}", response_model=PromptBreakdownResponse)
async def get_prompt_breakdown(run_id: UUID, prompt_id: int) -> PromptBreakdownResponse:
    return PromptBreakdownResponse(
        prompt_id=prompt_id,
        prompt="Email triage: summarize top 3 important emails",
        models=[
            ModelBreakdown(model="gpt-4o", scores=[], avg_score=0.0),
        ],
    )


@router.post("/{run_id}/analysis/chat", response_model=AnalysisChatResponse)
async def analysis_chat(
    run_id: UUID, payload: AnalysisChatRequest
) -> AnalysisChatResponse:
    return AnalysisChatResponse(response="Stub: analysis response")
