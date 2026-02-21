import asyncio
import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

from app.agents.judge_agent import (
    EVAL_QUESTIONS,
    HARDCODED_RESPONSES,
    judge_single_response,
    run_judge_sweep,
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
    RunMetricsResponse,
    RunResultsResponse,
    RunStatusResponse,
    StartRunRequest,
    StartRunResponse,
)

router = APIRouter()

_runs: dict[str, dict] = {}


@router.get("/questions")
async def get_eval_questions() -> list[dict[str, str]]:
    return EVAL_QUESTIONS


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


@router.websocket("/{run_id}/stream")
async def run_stream(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    try:
        models = list(HARDCODED_RESPONSES.keys())
        for i, model_id in enumerate(models):
            await websocket.send_json({
                "event": "model_started",
                "model_id": model_id,
                "index": i,
                "total": len(models),
            })

        while True:
            run = _runs.get(run_id)
            if run and run["status"] in ("completed", "failed"):
                if run["status"] == "completed" and run.get("result"):
                    result = run["result"]
                    for model_id, data in result["models"].items():
                        await websocket.send_json({
                            "event": "model_scored",
                            "model_id": model_id,
                            "scores": data["scores"],
                        })
                await websocket.send_json({
                    "event": "run_completed",
                    "status": run["status"],
                })
                break
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


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
