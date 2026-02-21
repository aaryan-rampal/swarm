from uuid import UUID

from app.agents.planner_agent import run_planner_chat
from app.schemas import (
    PlannerConfirmResponse,
    PlannerSessionCreateResponse,
    PlannerSessionMessageRequest,
    PlannerSessionMessageResponse,
    PlannerSessionResponse,
    ValidateSpecRequest,
    ValidateSpecResponse,
)
from app.swarm_orchestrator import run_sample_swarm
from app.swarm_runtime import runtime
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/sessions", response_model=PlannerSessionCreateResponse)
async def create_planner_session() -> PlannerSessionCreateResponse:
    session = runtime.create_session()
    return PlannerSessionCreateResponse(
        session_id=session["session_id"],
        status=session["status"],
    )


@router.get("/sessions/{session_id}", response_model=PlannerSessionResponse)
async def get_planner_session(session_id: UUID) -> PlannerSessionResponse:
    try:
        session = runtime.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    return PlannerSessionResponse(
        session_id=session["session_id"],
        status=session["status"],
        messages=session["messages"],
        draft_prompt=session["draft_prompt"],
        ready_to_confirm=session["ready_to_confirm"],
    )


def _session_messages_to_chat(session_messages: list[dict]) -> list[dict[str, str]]:
    """Convert runtime session messages to chat format [{role, content}]."""
    return [{"role": m["role"], "content": m["content"]} for m in session_messages]


@router.post(
    "/sessions/{session_id}/messages", response_model=PlannerSessionMessageResponse
)
async def planner_session_message(
    session_id: UUID,
    payload: PlannerSessionMessageRequest,
) -> PlannerSessionMessageResponse:
    try:
        session = runtime.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    runtime.add_session_message(session_id, role="user", content=payload.message)

    chat_messages = _session_messages_to_chat(session["messages"][:-1])
    try:
        result = await run_planner_chat(
            messages=chat_messages,
            user_message=payload.message,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    runtime.add_session_message(
        session_id, role="assistant", content=result["assistant_message"]
    )
    draft_prompt = result.get("draft_prompt") or ""
    session["draft_prompt"] = draft_prompt
    session["ready_to_confirm"] = result.get("draft_spec") is not None

    return PlannerSessionMessageResponse(
        assistant_message=result["assistant_message"],
        ready_to_confirm=session["ready_to_confirm"],
        draft_prompt=draft_prompt,
    )


@router.post("/sessions/{session_id}/confirm", response_model=PlannerConfirmResponse)
async def planner_session_confirm(session_id: UUID) -> PlannerConfirmResponse:
    try:
        session = runtime.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc

    if not session["ready_to_confirm"]:
        raise HTTPException(status_code=400, detail="Session is not ready to confirm")

    run = runtime.create_run(session_id)
    await run_sample_swarm(run["run_id"])
    return PlannerConfirmResponse(
        run_id=run["run_id"],
        status=runtime.runs[run["run_id"]]["status"],
        sse_sample_path=runtime.runs[run["run_id"]]["sse_sample_path"],
    )


@router.post("/validate", response_model=ValidateSpecResponse)
async def planner_validate(payload: ValidateSpecRequest) -> ValidateSpecResponse:
    return ValidateSpecResponse(valid=True, errors=[])
