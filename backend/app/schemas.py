from uuid import UUID

from pydantic import BaseModel, Field


# --- Brainstorming (existing) ---


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


# --- Planner API ---


class PlannerChatRequest(BaseModel):
    conversation_id: UUID
    message: str


class PlannerSessionCreateResponse(BaseModel):
    session_id: UUID
    status: str


class PlannerSessionMessageRequest(BaseModel):
    message: str


class PlannerSessionMessageResponse(BaseModel):
    assistant_message: str
    ready_to_confirm: bool
    draft_prompt: str


class PlannerSessionResponse(BaseModel):
    session_id: UUID
    status: str
    messages: list[dict] = Field(default_factory=list)
    draft_prompt: str
    ready_to_confirm: bool


class PlannerConfirmResponse(BaseModel):
    run_id: UUID
    status: str
    sse_sample_path: str


class PlannerChatResponse(BaseModel):
    assistant_message: str
    draft_spec: dict | None = None


class ValidateSpecRequest(BaseModel):
    spec: dict


class ValidateSpecResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)


# --- Benchmarks API ---


class CreateBenchmarkRequest(BaseModel):
    spec: dict


class CreateBenchmarkResponse(BaseModel):
    benchmark_id: UUID


# --- Runs API ---


class StartRunRequest(BaseModel):
    benchmark_id: UUID
    models: list[str]
    repetitions: int = 5


class StartRunResponse(BaseModel):
    run_id: UUID
    status: str


class RunStatusResponse(BaseModel):
    status: str
    progress: float
    total_tasks: int
    completed_tasks: int


class ModelStatus(BaseModel):
    model: str
    avg_score: float
    completed: int
    total: int


class RunResultItem(BaseModel):
    rep: int
    trace: str
    final: str
    tool_calls: list[dict]
    score: float
    latency: int
    cost: float


class RunResultsResponse(BaseModel):
    prompt: str
    runs: list[RunResultItem] = Field(default_factory=list)


class RunEvent(BaseModel):
    event_id: str
    cursor: str
    run_id: UUID
    session_id: UUID
    agent_id: str
    event_type: str
    phase: str
    content: str
    model: str
    timestamp: str
    weave: dict = Field(default_factory=dict)
    chunk_index: int | None = None
    content_delta: str | None = None
    reasoning_details: list[dict] = Field(default_factory=list)
    usage: dict | None = None


class RunEventsResponse(BaseModel):
    events: list[RunEvent] = Field(default_factory=list)
    next_cursor: str | None = None


class LeaderboardEntry(BaseModel):
    model: str
    mean_score: float
    std_dev: float
    hallucination_rate: float
    cost_total: float
    latency_p50: int


class RunMetricsResponse(BaseModel):
    cost_vs_score: list[dict] = Field(default_factory=list)
    stability_data: list[dict] = Field(default_factory=list)
    hallucination_rates: list[dict] = Field(default_factory=list)


class ModelBreakdown(BaseModel):
    model: str
    scores: list[float] = Field(default_factory=list)
    avg_score: float


class PromptBreakdownResponse(BaseModel):
    prompt_id: int
    prompt: str
    models: list[ModelBreakdown] = Field(default_factory=list)


# --- Analysis API ---


class AnalysisChatRequest(BaseModel):
    message: str


class AnalysisChatResponse(BaseModel):
    response: str
