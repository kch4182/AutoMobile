import asyncio
import os
from pathlib import Path

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view

from services.dashboard_service import (
    delete_test_run,
    delete_suite_run,
    get_dashboard_run_detail,
    get_heal_step_log,
    get_trace_step_logs_for_run,
    get_trace_step_logs_for_suite,
    list_dashboard_run_summaries,
    list_dashboard_suites,
    save_test_suite_result,
)


def _run_async(coro):
    """동기 Django view에서 prisma-client-python의 async 함수를 실행하기 위한 공통 래퍼입니다."""
    return asyncio.run(coro)


def _format_run_at(created_at):
    """프론트 Mock 데이터와 동일하게 'YYYY. MM. DD HH:MM AM/PM' 형식으로 변환합니다."""
    if created_at is None:
        return ""

    # Prisma가 timezone-aware datetime을 반환하면 Django 설정 TIME_ZONE 기준으로 변환합니다.
    if timezone.is_aware(created_at):
        created_at = timezone.localtime(created_at)

    return created_at.strftime("%Y. %m. %d %H:%M %p")


def _serialize_step(step):
    """TestStepLog 모델을 Dashboard.tsx가 바로 사용할 수 있는 step JSON으로 변환합니다."""
    return {
        "id": step.id,
        "index": step.stepIndex,
        "action": step.action,
        "description": step.description,
        "success": step.success,
        "message": step.message,
        "traceImage": step.traceImage,
        "isHealed": step.isHealed,
        "healDetails": step.healDetails,
    }


def _json_safe(value):
    """Keep Prisma Json fields serializable even if the client returns wrappers."""
    if value is None:
        return None
    if isinstance(value, (dict, list, str, int, float, bool)):
        return value
    if hasattr(value, "data"):
        return _json_safe(value.data)
    return str(value)


def _iso_datetime(value):
    if value is None:
        return None
    try:
        return value.isoformat()
    except AttributeError:
        return str(value)


def _serialize_dashboard_step(step):
    return {
        "id": step.id,
        "runId": step.runId,
        "index": step.stepIndex,
        "action": step.action,
        "description": step.description,
        "success": bool(step.success),
        "message": step.message,
        "traceImage": step.traceImage,
        "isHealed": bool(step.isHealed),
        "healDetails": _json_safe(step.healDetails),
    }


def _serialize_dashboard_run_summary(run, suite):
    project = getattr(suite, "project", None)
    return {
        "id": run.id,
        "suiteId": suite.id,
        "projectId": suite.projectId,
        "projectName": project.name if project else "",
        "scenarioName": run.scenarioName,
        "status": run.status,
        "duration": run.duration,
        "suiteStatus": suite.status,
        "totalDuration": suite.totalDuration,
        "createdAt": _iso_datetime(suite.createdAt),
    }


def _serialize_dashboard_run_detail(run):
    suite = getattr(run, "suite", None)
    project = getattr(suite, "project", None) if suite else None
    return {
        "id": run.id,
        "suiteId": run.suiteId,
        "projectId": suite.projectId if suite else None,
        "projectName": project.name if project else "",
        "scenarioName": run.scenarioName,
        "status": run.status,
        "duration": run.duration,
        "createdAt": _iso_datetime(suite.createdAt if suite else None),
        "steps": [_serialize_dashboard_step(step) for step in (run.steps or [])],
    }


def _serialize_run(run):
    """TestRun 모델을 프론트 Mock의 runs[] 구조와 동일하게 직렬화합니다."""
    return {
        "id": run.id,
        "scenarioName": run.scenarioName,
        "status": run.status,
        "duration": run.duration,
        "steps": [_serialize_step(step) for step in (run.steps or [])],
    }


def _serialize_suite(suite):
    """TestSuiteRun 모델을 Dashboard.tsx의 suite 카드/상세 뷰 구조로 변환합니다."""
    project = getattr(suite, "project", None)
    return {
        "id": suite.id,
        "projectId": suite.projectId,
        "projectName": project.name if project else "",
        "runAt": _format_run_at(suite.createdAt),
        "totalDuration": suite.totalDuration,
        "status": suite.status,
        "runs": [_serialize_run(run) for run in (suite.runs or [])],
    }


@csrf_exempt
@api_view(["GET"])
def dashboard_runs_api(request):
    """
    GET /api/dashboard/runs/ - recent 30 run summaries.
    This endpoint intentionally excludes TestStepLog.
    """
    try:
        suites = _run_async(list_dashboard_run_summaries(limit=30))
        runs = []
        for suite in suites:
            for run in suite.runs or []:
                runs.append(_serialize_dashboard_run_summary(run, suite))
        runs.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
        return JsonResponse({"status": "success", "runs": runs[:30]}, status=200)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(["POST"])
def dashboard_run_save_api(request):
    """POST /api/dashboard/runs/save/ - persist completed or failed Play results."""
    try:
        data = request.data or {}
        project_id = data.get("projectId")
        suite_result = data.get("suiteResult") or {}
        if not project_id:
            return JsonResponse({"status": "error", "message": "projectId가 필요합니다."}, status=400)
        if not isinstance(suite_result.get("runs"), list):
            return JsonResponse({"status": "error", "message": "suiteResult.runs가 필요합니다."}, status=400)

        saved = _run_async(save_test_suite_result(int(project_id), suite_result))
        return JsonResponse(
            {
                "status": "success",
                "suiteId": saved.id,
                "createdAt": _iso_datetime(saved.createdAt),
            },
            status=201,
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(["GET", "DELETE"])
def dashboard_run_detail_api(request, run_id: int):
    """
    GET /api/dashboard/runs/<id>/ - TestRun detail with TestStepLog.
    DELETE /api/dashboard/runs/<id>/ - delete trace image files first, then DB row.
    """
    if request.method == "GET":
        try:
            run = _run_async(get_dashboard_run_detail(run_id))
            if run is None:
                return JsonResponse({"status": "error", "message": "TestRun을 찾을 수 없습니다."}, status=404)
            return JsonResponse({"status": "success", "run": _serialize_dashboard_run_detail(run)}, status=200)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    try:
        trace_steps = _run_async(get_trace_step_logs_for_run(run_id))
        if trace_steps is None:
            return JsonResponse({"status": "error", "message": "삭제할 TestRun을 찾을 수 없습니다."}, status=404)

        file_results = []
        for step in trace_steps:
            if step.traceImage:
                file_results.append(_remove_trace_image(step.traceImage))

        deleted_run = _run_async(delete_test_run(run_id))
        return JsonResponse(
            {
                "status": "success",
                "message": "테스트 실행 내역과 trace 이미지 삭제가 완료되었습니다.",
                "runId": deleted_run.id,
                "deletedTraceFiles": file_results,
            },
            status=200,
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


def _get_payload_value(data, *keys):
    """camelCase와 snake_case 요청 바디를 모두 허용해 프론트 변경에 조금 더 유연하게 대응합니다."""
    for key in keys:
        if key in data and data.get(key) is not None:
            return data.get(key)
    return None


def _to_int(value, field_name):
    """API 입력값을 int로 변환하고, 실패 시 사용자에게 돌려줄 명확한 오류를 만듭니다."""
    try:
        return int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} 값은 정수여야 합니다.")


def _resolve_trace_image_path(trace_image: str):
    """
    DB에 저장된 traceImage 문자열을 실제 서버 파일 경로로 변환합니다.

    예: 'media/traces/trace_123.png' 또는 '/media/traces/trace_123.png'
    -> settings.MEDIA_ROOT / 'traces/trace_123.png'
    """
    if not trace_image:
        return None

    raw_path = str(trace_image).strip()

    # 외부 URL은 서버 디스크의 파일이 아니므로 os.remove 대상에서 제외합니다.
    if raw_path.startswith(("http://", "https://")):
        return None

    # 쿼리스트링이 붙은 이미지 URL 형태도 파일 확장자 검증 전에 제거합니다.
    raw_path = raw_path.split("?", 1)[0].replace("\\", "/").lstrip("/")
    if not raw_path.lower().endswith(".png"):
        return None

    media_url_prefix = settings.MEDIA_URL.strip("/")
    if media_url_prefix and raw_path.startswith(f"{media_url_prefix}/"):
        raw_path = raw_path[len(media_url_prefix) + 1 :]

    media_root = Path(settings.MEDIA_ROOT).resolve()
    absolute_path = (media_root / raw_path).resolve()

    # DB 값이 조작되어도 MEDIA_ROOT 밖의 파일을 삭제하지 않도록 경로 탈출을 차단합니다.
    try:
        absolute_path.relative_to(media_root)
    except ValueError:
        return None

    return absolute_path


def _remove_trace_image(trace_image: str):
    """trace png 파일을 실제 디스크에서 삭제하고, 삭제 결과를 API 응답에 포함할 수 있게 반환합니다."""
    absolute_path = _resolve_trace_image_path(trace_image)
    if absolute_path is None:
        return {
            "traceImage": trace_image,
            "deleted": False,
            "reason": "skipped",
        }

    try:
        os.remove(absolute_path)
        return {
            "traceImage": trace_image,
            "deleted": True,
            "path": str(absolute_path),
        }
    except FileNotFoundError:
        # 파일이 이미 없더라도 DB hard delete는 계속 진행해야 합니다.
        return {
            "traceImage": trace_image,
            "deleted": False,
            "path": str(absolute_path),
            "reason": "file_not_found",
        }


@csrf_exempt
@api_view(["GET"])
def dashboard_suites_api(request):
    """GET /api/dashboard/suites/ - 대시보드 실행 이력 전체를 최신순으로 조회합니다."""
    try:
        suites = _run_async(list_dashboard_suites())
        return JsonResponse(
            {
                "status": "success",
                "suites": [_serialize_suite(suite) for suite in suites],
            },
            status=200,
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(["DELETE"])
def dashboard_suite_delete_api(request, suite_id: int):
    """
    DELETE /api/dashboard/suites/<suite_id>/ - suite 실행 이력과 trace png 파일을 완전히 삭제합니다.

    DB 삭제 전에 traceImage가 있는 TestStepLog를 먼저 조회하고,
    각 png 파일을 settings.MEDIA_ROOT 기준 실제 경로로 찾아 os.remove로 제거합니다.
    """
    try:
        trace_steps = _run_async(get_trace_step_logs_for_suite(suite_id))
        if trace_steps is None:
            return JsonResponse(
                {"status": "error", "message": "삭제할 TestSuiteRun을 찾을 수 없습니다."},
                status=404,
            )

        file_results = []
        for step in trace_steps:
            if step.traceImage:
                file_results.append(_remove_trace_image(step.traceImage))

        deleted_suite = _run_async(delete_suite_run(suite_id))
        return JsonResponse(
            {
                "status": "success",
                "message": "테스트 실행 이력과 trace 이미지 삭제가 완료되었습니다.",
                "suiteId": deleted_suite.id,
                "deletedTraceFiles": file_results,
            },
            status=200,
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(["POST"])
def approve_heal_api(request):
    """
    POST /api/dashboard/heal/approve/ - AI Healing 결과를 승인합니다.

    요청 바디는 { "runId": 1, "stepIndex": 2 } 또는 { "logId": 10 } 형태를 허용합니다.
    """
    try:
        data = request.data or {}
        log_id_raw = _get_payload_value(data, "logId", "log_id", "id")
        run_id_raw = _get_payload_value(data, "runId", "run_id")
        step_index_raw = _get_payload_value(data, "stepIndex", "step_index")

        log_id = _to_int(log_id_raw, "logId") if log_id_raw is not None else None
        run_id = _to_int(run_id_raw, "runId") if run_id_raw is not None else None
        step_index = _to_int(step_index_raw, "stepIndex") if step_index_raw is not None else None

        if log_id is None and (run_id is None or step_index is None):
            return JsonResponse(
                {"status": "error", "message": "logId 또는 runId + stepIndex가 필요합니다."},
                status=400,
            )

        step_log = _run_async(get_heal_step_log(run_id=run_id, step_index=step_index, log_id=log_id))
        if step_log is None:
            return JsonResponse(
                {"status": "error", "message": "AI Healing 승인 대상 step 로그를 찾을 수 없습니다."},
                status=404,
            )

        if not step_log.healDetails:
            return JsonResponse(
                {"status": "error", "message": "해당 step에는 healDetails가 저장되어 있지 않습니다."},
                status=400,
            )

        # // TODO: healDetails를 파싱해 original selector를 찾고, found selector 값으로 원본 scenario JSON 파일을 덮어쓰는 로직을 여기에 추가합니다.

        return JsonResponse(
            {
                "status": "success",
                "message": "AI Healing 변경안이 승인되었습니다.",
                "logId": step_log.id,
                "runId": step_log.runId,
                "stepIndex": step_log.stepIndex,
                "healDetails": step_log.healDetails,
            },
            status=200,
        )
    except ValueError as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
