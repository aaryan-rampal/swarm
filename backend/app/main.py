from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException

from app.agents.brainstorming_agent import (
    run_brainstorming_agent,
    run_brainstorming_full_flow,
)
from app.config import get_settings
from app.schemas import (
    BrainstormFullFlowResponse,
    BrainstormTestRequest,
    BrainstormTestResponse,
)
from app.telemetry import init_weave


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_weave()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "env": settings.app_env}


@app.post("/brainstorm/test", response_model=BrainstormTestResponse)
async def brainstorm_test(payload: BrainstormTestRequest) -> BrainstormTestResponse:
    try:
        result = await run_brainstorming_agent(task=payload.task, model=payload.model)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BrainstormTestResponse(
        model=result["model"], output=result["assistant_message"]
    )


@app.post("/brainstorm/full-test", response_model=BrainstormFullFlowResponse)
async def brainstorm_full_test(
    payload: BrainstormTestRequest,
) -> BrainstormFullFlowResponse:
    try:
        result = await run_brainstorming_full_flow(
            task=payload.task, model=payload.model
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return BrainstormFullFlowResponse(
        model=result["model"],
        synthetic_data=result["synthetic_data"],
        judging_criteria=result["judging_criteria"],
        prompt_template=result["prompt_template"],
    )
