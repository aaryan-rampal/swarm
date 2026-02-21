from pydantic import BaseModel, Field


class BrainstormTestRequest(BaseModel):
    task: str = Field(
        default="Summarize my top 3 most important emails.",
        description="Task description for the brainstorming agent",
    )
    model: str | None = Field(
        default=None, description="Optional OpenRouter model override"
    )


class BrainstormTestResponse(BaseModel):
    model: str
    output: str


class BrainstormFullFlowResponse(BaseModel):
    model: str
    synthetic_data: dict
    judging_criteria: dict
    prompt_template: str
