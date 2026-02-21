from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.schemas import (
    PlannerConfirmResponse,
    PlannerChatRequest,
    PlannerChatResponse,
    PlannerSessionCreateResponse,
    PlannerSessionMessageRequest,
    PlannerSessionMessageResponse,
    PlannerSessionResponse,
    ValidateSpecRequest,
    ValidateSpecResponse,
)
from app.swarm_orchestrator import run_sample_swarm
from app.swarm_runtime import runtime

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
    draft_prompt = "Summarize the top 3 most important emails with rationale, action items, and urgency labels."
    assistant_message = (
        "Got it. I will prioritize legal/compliance and payroll-critical emails, include one"
        " medium-priority update, and ignore spam. Press confirm when this direction looks good."
    )
    runtime.add_session_message(session_id, role="assistant", content=assistant_message)
    session["draft_prompt"] = draft_prompt
    session["ready_to_confirm"] = True

    return PlannerSessionMessageResponse(
        assistant_message=assistant_message,
        ready_to_confirm=True,
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


@router.post("/chat", response_model=PlannerChatResponse)
async def planner_chat(payload: PlannerChatRequest) -> PlannerChatResponse:
    return PlannerChatResponse(
        assistant_message="Stub: planning response",
        draft_spec=None,
    )


@router.post("/validate", response_model=ValidateSpecResponse)
async def planner_validate(payload: ValidateSpecRequest) -> ValidateSpecResponse:
    return ValidateSpecResponse(valid=True, errors=[])
