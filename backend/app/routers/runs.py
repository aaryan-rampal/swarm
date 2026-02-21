from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

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
from app.swarm_runtime import runtime

router = APIRouter()


@router.post("", response_model=StartRunResponse)
async def start_run(payload: StartRunRequest) -> StartRunResponse:
    return StartRunResponse(run_id=uuid4(), status="running")


@router.get("/{run_id}", response_model=RunStatusResponse)
async def get_run_status(run_id: UUID) -> RunStatusResponse:
    return RunStatusResponse(
        status="running",
        progress=0.0,
        total_tasks=200,
        completed_tasks=0,
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
) -> RunEventsResponse:
    if run_id not in runtime.runs:
        raise HTTPException(status_code=404, detail="Run not found")
    events = runtime.get_events(run_id, cursor=cursor)
    response_events = [RunEvent(**event) for event in events]
    next_cursor = response_events[-1].cursor if response_events else cursor
    return RunEventsResponse(events=response_events, next_cursor=next_cursor)


@router.get("/{run_id}/stream")
async def stream_run_events(run_id: UUID) -> StreamingResponse:
    if run_id not in runtime.runs:
        raise HTTPException(status_code=404, detail="Run not found")

    events = runtime.get_events(run_id)

    async def event_stream():
        for event in events:
            yield runtime.to_sse_block(event)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.websocket("/{run_id}/stream")
async def run_stream(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    try:
        await websocket.send_json({"event": "task_started", "task_id": "stub"})
        await websocket.send_json({"event": "task_completed", "task_id": "stub"})
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


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
