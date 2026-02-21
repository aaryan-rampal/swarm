from __future__ import annotations

import asyncio
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.model_registry import load_models
from app.schemas import (
    AnalysisChatRequest,
    AnalysisChatResponse,
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


@router.post("/start")
async def start_swarm_run():
    """Create a new swarm run, kick it off in the background, and return immediately."""
    models = load_models()
    session = runtime.create_session()
    run = runtime.create_run(session["session_id"])
    run_id = run["run_id"]

    asyncio.create_task(run_swarm(run_id, models))

    return {
        "run_id": str(run_id),
        "models": [
            {"id": m.id, "name": m.name, "provider": m.provider, "color": m.color}
            for m in models
        ],
    }


@router.post("", response_model=StartRunResponse)
async def start_run(payload: StartRunRequest) -> StartRunResponse:
    return StartRunResponse(run_id=uuid4(), status="running")


@router.get("/{run_id}", response_model=RunStatusResponse)
async def get_run_status(run_id: UUID) -> RunStatusResponse:
    if run_id not in runtime.runs:
        raise HTTPException(status_code=404, detail="Run not found")
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


@router.get("/{run_id}/models", response_model=list[ModelStatus])
async def get_run_models(run_id: UUID) -> list[ModelStatus]:
    return [
        ModelStatus(model="gpt-4o", avg_score=0.0, completed=0, total=20),
        ModelStatus(model="claude-3-sonnet", avg_score=0.0, completed=0, total=20),
    ]


@router.get("/{run_id}/results", response_model=RunResultsResponse)
async def get_run_results(
    run_id: UUID,
    model: str | None = Query(default=None),
    prompt_id: int | None = Query(default=None),
) -> RunResultsResponse:
    return RunResultsResponse(prompt="Stub prompt", runs=[])


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
    return [
        LeaderboardEntry(
            model="gpt-4o",
            mean_score=0.0,
            std_dev=0.0,
            hallucination_rate=0.0,
            cost_total=0.0,
            latency_p50=0,
        ),
    ]


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
        prompt="Stub prompt",
        models=[
            ModelBreakdown(model="gpt-4o", scores=[], avg_score=0.0),
        ],
    )


@router.post("/{run_id}/analysis/chat", response_model=AnalysisChatResponse)
async def analysis_chat(
    run_id: UUID, payload: AnalysisChatRequest
) -> AnalysisChatResponse:
    return AnalysisChatResponse(response="Stub: analysis response")
