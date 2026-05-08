from __future__ import annotations

from typing import Any

from prisma import Json
from services.prisma_client import ensure_prisma_connected


def _to_float(value: Any, default: float = 0.0) -> float:
    """숫자형 필드는 프론트/실행 엔진에서 문자열로 들어올 수도 있어 안전하게 Float로 변환합니다."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_bool(value: Any, default: bool = False) -> bool:
    """Boolean 필드는 None, 문자열, 숫자 입력을 방어적으로 처리해 DB 저장 오류를 줄입니다."""
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "y"}
    return bool(value)


def _build_step_create_data(step: dict[str, Any], fallback_index: int) -> dict[str, Any]:
    """프론트 Mock 구조와 실제 Play 실행 로그 구조를 TestStepLog create payload로 정규화합니다."""
    trace_image = step.get("traceImage") or step.get("trace_image")
    heal_details = step.get("healDetails") or step.get("heal_details")

    # 실행 엔진은 message 대신 verify.reason만 내려줄 수 있으므로 대시보드에 표시할 문구를 보강합니다.
    message = step.get("message")
    if not message and isinstance(step.get("verify"), dict):
        message = step["verify"].get("reason")
    if not message:
        message = "Step execution completed"

    data: dict[str, Any] = {
        "stepIndex": int(step.get("index", fallback_index)),
        "action": str(step.get("action") or "unknown"),
        "description": str(step.get("description") or step.get("label") or step.get("action") or "unknown"),
        "success": _to_bool(step.get("success"), default=False),
        "message": str(message),
        "traceImage": str(trace_image) if trace_image else None,
        "isHealed": _to_bool(step.get("isHealed") or step.get("is_healed"), default=False),
    }

    # Prisma Json 필드는 dict/list를 Json(...)으로 감싸야 prisma-client-python이 올바르게 직렬화합니다.
    if heal_details is not None:
        data["healDetails"] = Json(heal_details)

    return data


def _build_run_create_data(run: dict[str, Any]) -> dict[str, Any]:
    """개별 시나리오 실행 결과를 TestRun nested create payload로 변환합니다."""
    steps = run.get("steps") or []
    if not isinstance(steps, list):
        steps = []

    return {
        "scenarioName": str(run.get("scenarioName") or run.get("scriptName") or "Unknown Scenario"),
        "status": str(run.get("status") or run.get("runStatus") or "unknown"),
        "duration": _to_float(run.get("duration"), default=0.0),
        "steps": {
            "create": [
                _build_step_create_data(step, index)
                for index, step in enumerate(steps)
                if isinstance(step, dict)
            ],
        },
    }


async def save_test_suite_result(project_id: int, suite_result: dict[str, Any]):
    """
    전체 테스트 스위트 실행 결과를 TestSuiteRun -> TestRun -> TestStepLog 순서로 한 번에 저장합니다.

    - Django view는 sync이므로 이 함수는 서비스 레이어에서만 async로 유지합니다.
    - 호출부에서는 반드시 asyncio.run(save_test_suite_result(...)) 형태로 실행합니다.
    - nested create를 사용해 suite, runs, steps를 하나의 Prisma create 호출로 저장합니다.
    """
    runs = suite_result.get("runs") or []
    if not isinstance(runs, list):
        runs = []

    db = await ensure_prisma_connected()
    return await db.testsuiterun.create(
            data={
                # Project와의 관계는 connect로 명시해 잘못된 projectId 입력을 DB 레벨에서 방어합니다.
                "project": {"connect": {"id": int(project_id)}},
                "totalDuration": _to_float(suite_result.get("totalDuration"), default=0.0),
                "status": str(suite_result.get("status") or "unknown"),
                "runs": {
                    "create": [
                        _build_run_create_data(run)
                        for run in runs
                        if isinstance(run, dict)
                    ],
                },
            },
            # 저장 직후 프론트 응답/검증에 바로 사용할 수 있도록 관계 데이터를 함께 로드합니다.
            include={
                "project": True,
                "runs": {
                    "include": {
                        "steps": True,
                    },
                },
            },
        )


async def list_dashboard_suites():
    """
    대시보드 실행 이력을 조회합니다.

    include로 Project, TestRun, TestStepLog를 한 번에 eager load하여
    suite마다 runs/steps를 추가 조회하는 N+1 문제를 방지합니다.
    """
    db = await ensure_prisma_connected()
    return await db.testsuiterun.find_many(
            order={"createdAt": "desc"},
            include={
                "project": True,
                "runs": {
                    "order_by": {"id": "asc"},
                    "include": {
                        "steps": {
                            "order_by": {"stepIndex": "asc"},
                        },
                    },
                },
            },
        )


async def list_dashboard_run_summaries(limit: int = 30):
    """
    Dashboard Phase 2 summary API.

    Fetch TestSuiteRun + TestRun only. TestStepLog is intentionally excluded to
    prevent over-fetching large trace/healing payloads on the list page.
    """
    db = await ensure_prisma_connected()
    return await db.testsuiterun.find_many(
        take=int(limit),
        order={"createdAt": "desc"},
        include={
            "project": True,
            "runs": {
                "order_by": {"id": "asc"},
            },
        },
    )


async def get_dashboard_run_detail(run_id: int):
    """Fetch a single TestRun and its TestStepLog rows only when the user opens detail."""
    db = await ensure_prisma_connected()
    return await db.testrun.find_unique(
        where={"id": int(run_id)},
        include={
            "suite": {
                "include": {
                    "project": True,
                },
            },
            "steps": {
                "order_by": {"stepIndex": "asc"},
            },
        },
    )


async def get_trace_step_logs_for_run(run_id: int):
    """Return trace-bearing TestStepLog rows before deleting a TestRun."""
    db = await ensure_prisma_connected()
    run = await db.testrun.find_unique(where={"id": int(run_id)})
    if run is None:
        return None

    return await db.teststeplog.find_many(
        where={
            "runId": int(run_id),
            "traceImage": {"not": None},
        },
        order={"id": "asc"},
    )


async def delete_test_run(run_id: int):
    """Delete one TestRun. TestStepLog rows cascade by schema onDelete."""
    db = await ensure_prisma_connected()
    return await db.testrun.delete(where={"id": int(run_id)})


async def get_trace_step_logs_for_suite(suite_id: int):
    """
    Hard delete 전에 해당 suite에 연결된 traceImage 보유 step 로그만 조회합니다.

    반환값이 None이면 suite 자체가 존재하지 않는다는 뜻이고,
    빈 리스트이면 suite는 있지만 삭제할 이미지 파일이 없다는 뜻입니다.
    """
    db = await ensure_prisma_connected()
    suite = await db.testsuiterun.find_unique(where={"id": int(suite_id)})
    if suite is None:
        return None

    return await db.teststeplog.find_many(
            where={
                "traceImage": {"not": None},
                "run": {
                    "is": {
                        "suiteId": int(suite_id),
                    },
                },
            },
            order={"id": "asc"},
        )


async def delete_suite_run(suite_id: int):
    """TestSuiteRun을 삭제합니다. 하위 TestRun/TestStepLog는 schema.prisma의 onDelete: Cascade가 처리합니다."""
    db = await ensure_prisma_connected()
    return await db.testsuiterun.delete(where={"id": int(suite_id)})


async def get_heal_step_log(*, run_id: int | None = None, step_index: int | None = None, log_id: int | None = None):
    """
    AI Healing 승인 대상 step 로그를 조회합니다.

    - log_id가 있으면 특정 TestStepLog를 직접 조회합니다.
    - log_id가 없으면 runId + stepIndex 조합으로 조회합니다.
    """
    db = await ensure_prisma_connected()
    if log_id is not None:
        return await db.teststeplog.find_unique(where={"id": int(log_id)})

    if run_id is None or step_index is None:
        return None

    return await db.teststeplog.find_first(
            where={
                "runId": int(run_id),
                "stepIndex": int(step_index),
            },
        )
