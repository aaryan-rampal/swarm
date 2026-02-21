from uuid import uuid4

from fastapi import APIRouter

from app.schemas import CreateBenchmarkRequest, CreateBenchmarkResponse

router = APIRouter()


@router.post("/benchmarks", response_model=CreateBenchmarkResponse)
async def create_benchmark(payload: CreateBenchmarkRequest) -> CreateBenchmarkResponse:
    return CreateBenchmarkResponse(benchmark_id=uuid4())
