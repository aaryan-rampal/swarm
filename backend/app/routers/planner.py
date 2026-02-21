from fastapi import APIRouter

from app.schemas import (
    PlannerChatRequest,
    PlannerChatResponse,
    ValidateSpecRequest,
    ValidateSpecResponse,
)

router = APIRouter()


@router.post("/chat", response_model=PlannerChatResponse)
async def planner_chat(payload: PlannerChatRequest) -> PlannerChatResponse:
    return PlannerChatResponse(
        assistant_message="Stub: planning response",
        draft_spec=None,
    )


@router.post("/validate", response_model=ValidateSpecResponse)
async def planner_validate(payload: ValidateSpecRequest) -> ValidateSpecResponse:
    return ValidateSpecResponse(valid=True, errors=[])
