import time
import json
import asyncio
import re
import subprocess
import uiautomator2 as u2

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from prisma import Json

# 앱 종속 설정은 여기서만 참조 (재사용성)
from app_config import PACKAGE_NAME, MAIN_ACTIVITY_PATH, RESET_INTENT_COMMAND

# 💡 Service Layer 연결
from services.aiService import AiAgent, AIAdapterError, extract_bearer_token
from services.inspectorService import inspector
from services.deviceService import deviceManager
from services.prisma_client import ensure_prisma_connected

# 시나리오 중단 신호 (Global State)
STOP_SIGNAL = False


def _run_async(coro):
    """Sync Django view에서 Prisma async 코루틴 실행"""
    return asyncio.run(coro)


async def _list_projects():
    db = await ensure_prisma_connected()
    return await db.project.find_many(order={"id": "asc"})


async def _find_project_by_name(name: str):
    db = await ensure_prisma_connected()
    return await db.project.find_first(where={"name": name})


async def _get_project_by_id(project_id: int):
    db = await ensure_prisma_connected()
    return await db.project.find_unique(where={"id": project_id})


async def _create_project(name: str, package_name: str, main_activity: str | None):
    db = await ensure_prisma_connected()
    return await db.project.create(
        data={
            "name": name,
            "packageName": package_name,
            "mainActivity": main_activity,
        }
    )


async def _update_project_fields(project_id: int, updates: dict):
    db = await ensure_prisma_connected()
    if not updates:
        return await db.project.find_unique(where={"id": project_id})
    return await db.project.update(where={"id": project_id}, data=updates)


async def _get_app_config(package_name: str):
    db = await ensure_prisma_connected()
    return await db.appconfig.find_unique(where={"package_name": package_name})


async def _upsert_app_config(package_name: str, reset_element):
    db = await ensure_prisma_connected()
    try:
        # 데이터가 None이면 빈 딕셔너리로 처리하여 에러 방지
        json_data = reset_element if reset_element is not None else {}
        
        # Prisma Upsert는 where 조건에 맞는 게 없으면 create, 있으면 update를 수행함
        return await db.appconfig.upsert(
            where={
                'package_name': package_name,
            },
            data={
                'create': {
                    'package_name': package_name,
                    'reset_element': Json(json_data), # 👈 명시적으로 Json 래핑
                },
                'update': {
                    'reset_element': Json(json_data), # 👈 명시적으로 Json 래핑
                },
            },
        )
    except Exception as e:
        print(f"❌ DB Upsert 상세 에러: {str(e)}") # 터미널에 상세 에러 출력
        raise e



def _get_current_package_name():
    device = deviceManager.getDevice()
    if not device:
        return None, "기기 연결 실패"
    try:
        app_info = device.app_current() or {}
        package_name = app_info.get("package")
        if not package_name:
            return None, "현재 전면에 켜진 앱이 없습니다."
        return package_name, None
    except Exception as e:
        return None, str(e)


def _json_body(request):
    if not request.body:
        return {}
    return json.loads(request.body.decode("utf-8"))


def _serialize_scenario(scenario):
    steps = sorted(scenario.steps or [], key=lambda s: s.order)
    return {
        "id": scenario.id,
        "name": scenario.name,
        "projectId": scenario.projectId,
        "updatedAt": scenario.createdAt.isoformat() if getattr(scenario, "createdAt", None) else None,
        "steps": [
            {
                "id": step.id,
                "action": step.action,
                "x": step.x,
                "y": step.y,
                "target_label": step.targetLabel,
                "description": step.description or step.action,
                "selector": step.selector,
                "target": step.target,
            }
            for step in steps
        ],
    }


def _normalize_imported_scenario(name, scenario):
    steps = scenario if isinstance(scenario, list) else scenario.get("steps", []) if isinstance(scenario, dict) else []
    changed = False
    normalized_steps = []
    for index, step in enumerate(steps):
        if not isinstance(step, dict):
            continue
        next_step = {**step}
        if "id" not in next_step:
            next_step["id"] = int(time.time() * 1000) + index
            changed = True
        normalized_steps.append(next_step)
    return {"scriptName": name, "steps": normalized_steps}, changed

@api_view(['GET'])
def device_info(request):
    """현재 기기 해상도 및 연결 상태 확인 (에러 시 서버 다운 방지)"""
    try:
        device = deviceManager.getDevice()
        if not device:
            # 기기가 없으면 503 에러를 던져서 프론트가 오프라인으로 인식하게 함
            return JsonResponse({"width": 1080, "height": 2400, "connected": False, "error": "Device not found"}, status=503)
            
        w, h = device.window_size()
        return JsonResponse({"width": w, "height": h, "connected": True})
        
    except Exception as e:
        print(f"⚠️ Device disconnected or error: {e}")
        return JsonResponse({"width": 1080, "height": 2400, "connected": False, "error": str(e)}, status=503)

@csrf_exempt
@api_view(['POST'])
def launch_app(request):
    """특정 앱 강제 종료 후 재실행 (Monkey 사용)"""
    package = request.data.get('package') or request.data.get('packageName')
    main_activity = request.data.get('mainActivity')
    device = deviceManager.getDevice()
    
    if device and package:
        try:
            device.shell(f"am force-stop {package}")
            time.sleep(0.5)
            if main_activity:
                # 프로젝트별 메인 액티비티를 명시 실행
                device.shell(f"am start -n {package}/{main_activity}")
            else:
                # 하위 호환: 기존 monkey launch
                device.shell(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
            return JsonResponse({"status": "success"})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
            
    return JsonResponse({"status": "error", "message": "기기 또는 패키지명 없음"}, status=400)


@csrf_exempt
@api_view(['POST'])
def reset_app(request):
    """
    시나리오 종료 후 앱을 '부드럽게' 초기화하는 API.
    - force-stop 대신 clear-task/new-task로 메인 액티비티를 재시작
    - app_config.py의 변수만 바꾸면 다른 앱에도 재사용 가능
    """
    device = deviceManager.getDevice()
    if not device:
        return JsonResponse({"status": "error", "message": "기기 연결 실패"}, status=400)

    package = request.data.get('package') or request.data.get('packageName') or PACKAGE_NAME
    main_activity = request.data.get('mainActivity') or MAIN_ACTIVITY_PATH
    reset_command = (
        f"am start -n {package}/{main_activity} "
        f"--activity-clear-task --activity-new-task"
    )

    try:
        # 1) 앱 완전 종료
        device.shell(f"am force-stop {package}")
        time.sleep(1)

        # 2) 메인 액티비티로 clear/new task 재실행
        device.shell(reset_command if package and main_activity else RESET_INTENT_COMMAND)
        return JsonResponse({
            "status": "success",
            "package": package,
            "main_activity": main_activity,
            "command": reset_command if package and main_activity else RESET_INTENT_COMMAND,
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(['GET'])
def current_app_info(request):
    device = deviceManager.getDevice()
    if not device:
        return JsonResponse({"status": "error", "message": "기기 연결 실패"})

    try:
        # [Step 1] 기본 정보 및 패키지명 가져오기
        app_info = device.app_current()
        package_name = app_info.get('package')
        main_activity = app_info.get('activity', '')
        app_name = ''

        if not package_name:
            return JsonResponse({"status": "error", "message": "현재 전면에 켜진 앱이 없습니다."})

        # ---------------------------------------------------------
        # [Step 2] 정상적인 방법(1순위)으로 앱 이름(Label) 시도
        # ---------------------------------------------------------
        try:
            if hasattr(device, 'app_info'):
                detail = device.app_info(package_name)
                if isinstance(detail, dict):
                    app_name = detail.get('label', '')
        except Exception:
            app_name = ''

        # ---------------------------------------------------------
        # [Step 3] 예외 처리(2순위): 이름이 비어있으면 해킹(Dumpsys) 시도
        # ---------------------------------------------------------
        if not app_name:
            try:
                raw_dump = device.shell("dumpsys activity top").output
                
                # 패턴: 패키지/액티비티#번호 뒤에 나오는 텍스트 추출 
                # 예: com.vetching.../.MainActivity#0   
                regex_pattern = rf"{re.escape(package_name)}/.*#\d+\s+([^\t\n\r]+)"
                match = re.search(regex_pattern, raw_dump)
                
                if match:
                    app_name = match.group(1).strip()
                else:
                    # 보조 패턴: title= 키워드 추적
                    for line in raw_dump.split('\n'):
                        if package_name in line and 'title=' in line:
                            title_match = re.search(r"title=([^,\s}]+)", line)
                            if title_match:
                                app_name = title_match.group(1).strip()
                                break
            except Exception as e:
                print(f"⚠️ 백업 로직에서도 추출 실패: {e}")

        # [최종 응답]
        return JsonResponse({
            "status": "success",
            "appName": app_name,     
            "packageName": package_name,
            "mainActivity": main_activity,
            "raw_output": str(app_info)
        })

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)})


@csrf_exempt
def projects_api(request):
    """
    GET  /api/projects/ : 프로젝트 목록 조회
    POST /api/projects/ : 프로젝트 생성
    """
    if request.method == 'GET':
        try:
            projects = _run_async(_list_projects())
            return JsonResponse(
                {
                    "status": "success",
                    "projects": [
                        {
                            "id": p.id,
                            "name": p.name,
                            "packageName": p.packageName,
                            "mainActivity": p.mainActivity,
                        }
                        for p in projects
                    ],
                }
            )
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    name = (request.data.get('name') or '').strip()
    package_name = (request.data.get('packageName') or '').strip()
    main_activity_raw = request.data.get('mainActivity')
    main_activity = (main_activity_raw or '').strip() if isinstance(main_activity_raw, str) else None

    if not name or not package_name:
        return JsonResponse(
            {"status": "error", "message": "name, packageName은 필수입니다."},
            status=400
        )

    try:
        dup = _run_async(_find_project_by_name(name))
        if dup:
            return JsonResponse(
                {"status": "error", "message": "이미 추가된 프로젝트입니다", "code": "DUPLICATE_NAME"},
                status=409,
            )
        created = _run_async(_create_project(name, package_name, main_activity or None))
        return JsonResponse(
            {
                "status": "success",
                "project": {
                    "id": created.id,
                    "name": created.name,
                    "packageName": created.packageName,
                    "mainActivity": created.mainActivity,
                },
            },
            status=201
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
async def projects_api(request):
    """
    GET  /api/projects/ : 프로젝트 목록 조회
    POST /api/projects/ : 프로젝트 생성
    """
    if request.method == 'GET':
        try:
            projects = await _list_projects() # run_async 제거, await 직접 사용
            return JsonResponse({
                "status": "success",
                "projects": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "packageName": p.packageName,
                        "mainActivity": p.mainActivity,
                    }
                    for p in projects
                ],
            })
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    if request.method == 'POST':
        data = _json_body(request) # 💡 @api_view가 없으므로 _json_body 사용
        name = (data.get('name') or '').strip()
        package_name = (data.get('packageName') or '').strip()
        main_activity_raw = data.get('mainActivity')
        main_activity = (main_activity_raw or '').strip() if isinstance(main_activity_raw, str) else None

        if not name or not package_name:
            return JsonResponse({"status": "error", "message": "name, packageName은 필수입니다."}, status=400)

        try:
            dup = await _find_project_by_name(name)
            if dup:
                return JsonResponse({"status": "error", "message": "이미 추가된 프로젝트입니다", "code": "DUPLICATE_NAME"}, status=409)
                
            created = await _create_project(name, package_name, main_activity or None)
            return JsonResponse({
                "status": "success",
                "project": {
                    "id": created.id,
                    "name": created.name,
                    "packageName": created.packageName,
                    "mainActivity": created.mainActivity,
                },
            }, status=201)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

@csrf_exempt
async def project_detail_api(request, project_id: int):
    """프로젝트 패키지명 / 액티비티 / 이름 수정"""
    if request.method == 'DELETE':
        try:
            db = await ensure_prisma_connected()
            deleted = await db.project.delete(where={"id": int(project_id)})
            return JsonResponse({
                "status": "success",
                "project": {
                    "id": deleted.id,
                    "name": deleted.name,
                    "packageName": deleted.packageName,
                    "mainActivity": deleted.mainActivity,
                },
            })
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    if request.method != 'PATCH':
        return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)

    data = _json_body(request)
    name_in = "name" in data
    pkg_in = "packageName" in data
    main_in = "mainActivity" in data

    name_val = (data.get("name") or "").strip() if name_in else None
    package_val = (data.get("packageName") or "").strip() if pkg_in else None
    main_val = data.get("mainActivity")
    main_activity_val = main_val.strip() or None if main_in and isinstance(main_val, str) else None

    if name_in and not name_val:
        return JsonResponse({"status": "error", "message": "name은 비울 수 없습니다."}, status=400)
    if pkg_in and not package_val:
        return JsonResponse({"status": "error", "message": "packageName은 비울 수 없습니다."}, status=400)

    try:
        current = await _get_project_by_id(project_id)
        if not current:
            return JsonResponse({"status": "error", "message": "프로젝트를 찾을 수 없습니다."}, status=404)

        if name_in and name_val != current.name:
            other = await _find_project_by_name(name_val)
            if other and other.id != project_id:
                return JsonResponse({"status": "error", "message": "이미 추가된 프로젝트입니다", "code": "DUPLICATE_NAME"}, status=409)

        updates = {}
        if name_in: updates["name"] = name_val
        if pkg_in: updates["packageName"] = package_val
        if main_in: updates["mainActivity"] = main_activity_val

        updated = await _update_project_fields(project_id, updates)
        if not updated:
            return JsonResponse({"status": "error", "message": "업데이트 실패"}, status=500)
            
        return JsonResponse({
            "status": "success",
            "project": {
                "id": updated.id,
                "name": updated.name,
                "packageName": updated.packageName,
                "mainActivity": updated.mainActivity,
            },
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(['POST'])
def safe_go_home_api(request):
    """시나리오 체인 간 홈 복귀 (앱 force-stop 없음)"""
    ok = deviceManager.safe_go_home()
    return JsonResponse({"status": "success", "ok": ok})


@csrf_exempt
async def reset_target_api(request):
    """현재 전면 앱(package_name) 기준 시작점(reset_element) 조회/저장"""
    package_name, err = _get_current_package_name()
    if err:
        return JsonResponse({"status": "error", "message": err}, status=400)

    if request.method == 'GET':
        try:
            conf = await _get_app_config(package_name)
            return JsonResponse({
                "status": "success",
                "package_name": package_name,
                "reset_element": conf.reset_element if conf else None,
            })
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)

    if request.method == 'POST':
        data = _json_body(request)
        reset_element = data.get("reset_element")
        if reset_element is not None and not isinstance(reset_element, (dict, list)):
            return JsonResponse({"status": "error", "message": "reset_element는 JSON이어야 합니다."}, status=400)

        try:
            saved = await _upsert_app_config(package_name, reset_element)
            return JsonResponse({
                "status": "success",
                "package_name": package_name,
                "reset_element": saved.reset_element,
            })
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
async def apply_reset_target_api(request):
    """현재 앱에 저장된 시작점 요소를 찾아 클릭 (중단 신호 대응)"""
    global STOP_SIGNAL
    STOP_SIGNAL = False

    if request.method != 'POST':
        return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)

    package_name, err = _get_current_package_name()
    if err:
        return JsonResponse({"status": "error", "message": err}, status=400)

    device = deviceManager.getDevice()
    if not device:
        return JsonResponse({"status": "error", "message": "기기 연결 실패"}, status=400)

    try:
        conf = await _get_app_config(package_name)
        target = conf.reset_element if conf else None
        if not target:
            return JsonResponse({"status": "success", "applied": False, "message": "저장된 시작점이 없습니다."})

        coords = inspector.resolve_target_element(
            target, 
            stop_checker=lambda: STOP_SIGNAL 
        )

        if STOP_SIGNAL:
            return JsonResponse({"status": "stopped", "message": "사용자에 의해 탐색이 중단되었습니다."}, status=200)

        if not coords:
            return JsonResponse({"status": "error", "message": "시작점 요소를 찾지 못했습니다."}, status=404)

        device.click(coords[0], coords[1])
        return JsonResponse({
            "status": "success",
            "package_name": package_name,
            "applied": True,
            "coords": [coords[0], coords[1]],
        })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@csrf_exempt
@api_view(['POST'])
def tap_device(request):
    """[수동 클릭] 단순 좌표 클릭"""
    x = request.data.get('x')
    y = request.data.get('y')
    
    if x is None or y is None:
        return JsonResponse({"status": "error", "message": "좌표 누락"})

    if deviceManager.click(x, y):
        return JsonResponse({"status": "success"})
        
    return JsonResponse({"status": "error", "message": "클릭 실패"})

@csrf_exempt
@api_view(['POST'])
def swipe_device(request):
    """드래그/스와이프 동작 수행"""
    d = request.data
    device = deviceManager.getDevice()
    
    if device and all(k in d for k in ['x1', 'y1', 'x2', 'y2']):
        device.swipe(d['x1'], d['y1'], d['x2'], d['y2'], duration=0.2)
        return JsonResponse({"status": "success"})
        
    return JsonResponse({"status": "error", "message": "좌표 누락 또는 기기 없음"})

@csrf_exempt
@api_view(['POST'])
def type_text(request):
    """[수동 입력] 스마트 타이핑 적용"""
    text = request.data.get('text')
    if not text:
        return JsonResponse({"status": "error", "message": "텍스트 없음"})

    if deviceManager.smartTypeText(text):
        return JsonResponse({"status": "success", "text": text})
    
    return JsonResponse({"status": "error", "message": "입력 실패"})

@csrf_exempt
@api_view(['POST'])
def ask_ai_action(request):
    """[AI 자동화] 화면 분석 -> AI 판단 -> 실행"""
    userPrompt = request.data.get('prompt')
    if not userPrompt: 
        return JsonResponse({"status": "error", "message": "프롬프트 없음"})

    uiElements = inspector.get_smart_hierarchy()
    token = extract_bearer_token(request.headers.get('Authorization'))
    provider = request.headers.get('X-AI-Provider', 'gemini')
    fallback_token = extract_bearer_token(request.headers.get('X-AI-Fallback-Authorization'))
    try:
        aiResult = AiAgent.GetCoordinates(userPrompt, uiElements, token=token, provider=provider, fallback_token=fallback_token)
    except AIAdapterError:
        return JsonResponse({"status": "error", "message": "모든 AI Provider 응답 실패. 한도를 확인하세요."}, status=500)

    if aiResult:
        msgType = aiResult.get('type', 'chat')

        if msgType == 'action':
            x, y = aiResult.get('x'), aiResult.get('y')
            summary = aiResult.get('summary', 'AI Action')
            deviceManager.click(x, y)
            return JsonResponse({
                "status": "success", "mode": "action",
                "x": x, "y": y, "summary": summary,
                "message": f"✅ {summary} (완료)"
            })

        elif msgType == 'input':
            text = aiResult.get('text', '')
            summary = aiResult.get('summary', 'Input')
            deviceManager.smartTypeText(text)
            return JsonResponse({
                "status": "success", "mode": "input",
                "input_text": text, "summary": summary,
                "message": f"✅ 입력: {text}"
            })

        else:
            return JsonResponse({
                "status": "success", "mode": "chat", 
                "message": aiResult.get('message')
            })

    return JsonResponse({"status": "error", "message": "AI 응답 없음"})


@csrf_exempt
@api_view(['POST'])
def verify_ai_key(request):
    token = extract_bearer_token(request.headers.get('Authorization'))
    provider = request.headers.get('X-AI-Provider', 'gemini')
    if not token:
        return JsonResponse({"status": "error", "message": "API key is missing."}, status=401)

    try:
        fallback_token = extract_bearer_token(request.headers.get('X-AI-Fallback-Authorization'))
        AiAgent.GetCoordinates("verify key", [], token=token, provider=provider, fallback_token=fallback_token)
        return JsonResponse({"status": "success"})
    except AIAdapterError as e:
        return JsonResponse(
            {"status": "error", "message": str(e)},
            status=e.status_code if e.status_code in (401, 429) else 500,
        )


@csrf_exempt
async def scenarios_api(request):
    db = await ensure_prisma_connected()

    if request.method == 'GET':
        project_id = request.GET.get('projectId')
        where = {"projectId": int(project_id)} if project_id else {}
        scenarios = await db.scenario.find_many(
            where=where,
            order={"createdAt": "desc"},
            include={"steps": True},
        )
        return JsonResponse({"status": "success", "scenarios": [_serialize_scenario(s) for s in scenarios]})

    if request.method != 'POST':
        return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)

    data = _json_body(request)
    project_id = data.get("projectId")
    name = (data.get("name") or "New Scenario").strip()
    steps = data.get("steps") or []
    if not project_id or not isinstance(steps, list):
        return JsonResponse({"status": "error", "message": "projectId와 steps가 필요합니다."}, status=400)

    created = await db.scenario.create(
        data={
            "name": name,
            "project": {"connect": {"id": int(project_id)}},
            "steps": {
                "create": [
                    {
                        "order": index,
                        "action": str(step.get("action") or "unknown"),
                        "x": float(step["x"]) if step.get("x") is not None else None,
                        "y": float(step["y"]) if step.get("y") is not None else None,
                        "targetLabel": step.get("label") or step.get("target_label"),
                        "description": step.get("description"),
                        "selector": Json(step.get("selector")) if step.get("selector") is not None else None,
                        "target": Json(step.get("target")) if step.get("target") is not None else None,
                    }
                    for index, step in enumerate(steps)
                    if isinstance(step, dict)
                ]
            },
        },
        include={"steps": True},
    )
    return JsonResponse({"status": "success", "scenario": _serialize_scenario(created)}, status=201)


@csrf_exempt
async def scenario_detail_api(request, scenario_id: int):
    if request.method != 'DELETE':
        return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)

    db = await ensure_prisma_connected()
    await db.scenario.delete(where={"id": int(scenario_id)})
    return JsonResponse({"status": "success"})


@csrf_exempt
async def scenario_import_api(request):
    if request.method != 'POST':
        return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)

    data = _json_body(request)
    final_scenario, healed = _normalize_imported_scenario(
        data.get("scriptName") or "Imported_Scenario.json",
        data.get("scenario"),
    )
    return JsonResponse(
        {
            "status": "success",
            "self_healed": healed,
            "scenario": final_scenario,
        }
    )

@csrf_exempt
@api_view(['POST'])
def run_steps(request):
    """시나리오 재생 (폭포수 힐링 실행 엔진)"""
    global STOP_SIGNAL
    if request.data.get('reset_stop', True):
        STOP_SIGNAL = False

    steps = request.data.get('steps', [])
    device = deviceManager.getDevice()
    
    if not device:
        return JsonResponse({"status": "error", "message": "기기 연결 안됨"})

    for idx, step in enumerate(steps):
        if STOP_SIGNAL:
            return JsonResponse(
                {
                    "status": "stopped",
                    "success": False,
                    "stopped": True,
                    "message": "사용자에 의해 실행이 중단되었습니다.",
                    "stopped_index": idx,
                },
                status=200,
            )

        action = step.get('action')
        if action == 'tap_structure':
            target = step.get('target')
            coords = inspector.resolve_target_element(target, selector=step.get('selector'), stop_checker=lambda: STOP_SIGNAL)
            if STOP_SIGNAL:
                return JsonResponse(
                    {
                        "status": "stopped",
                        "success": False,
                        "stopped": True,
                        "message": "사용자에 의해 실행이 중단되었습니다.",
                        "stopped_index": idx,
                    },
                    status=200,
                )
            if coords:
                device.click(coords[0], coords[1])
            else:
                return JsonResponse(
                    {
                        "status": "error",
                        "success": False,
                        "message": f"{idx + 1}번째 step에서 타겟 요소를 찾지 못했습니다.",
                    },
                    status=400,
                )
        elif action == 'tap':
            device.click(step.get('x'), step.get('y'))
        elif action == 'swipe':
            device.swipe(step['x1'], step['y1'], step['x2'], step['y2'], duration=0.2)
        elif action == 'text':
            text = step.get('text') or step.get('input_text')
            if text:
                deviceManager.smartTypeText(text)

        time.sleep(1.2)

    return JsonResponse({"status": "success", "success": True})


def _execute_single_step_core(step, idx, device):
    """단일 step 실행 + 검증 결과를 반환한다."""
    before_hierarchy = device.dump_hierarchy()
    action = step.get('action')
    action_desc = step.get('description', action)

    if action == 'tap_structure':
        target = step.get('target')
        coords = inspector.resolve_target_element(target, selector=step.get('selector'), stop_checker=lambda: STOP_SIGNAL)
        if STOP_SIGNAL:
            return None, {
                "status": "stopped",
                "success": False,
                "stopped": True,
                "message": "사용자에 의해 실행이 중단되었습니다.",
                "stopped_index": idx,
            }, 200
        if not coords:
            trace_image = inspector.capture_trace()
            return None, {
                "status": "error",
                "success": False,
                "message": f"{idx + 1}번째 step에서 타겟 요소를 찾지 못했습니다.",
                "step": {
                    "index": idx,
                    "action": action,
                    "description": action_desc,
                    "success": False,
                    "verify": {"error": "타겟 요소 찾기 실패"},
                    "trace_image": trace_image,
                },
                "trace_image": trace_image,
            }, 400
        device.click(coords[0], coords[1])
    elif action == 'tap':
        device.click(step.get('x'), step.get('y'))
    elif action == 'swipe':
        device.swipe(step['x1'], step['y1'], step['x2'], step['y2'], duration=0.2)
    elif action == 'text':
        text = step.get('text') or step.get('input_text')
        if text:
            deviceManager.smartTypeText(text)
    elif action == 'wait':
        duration = step.get('duration', 2.0)
        try:
            duration = float(duration if duration is not None else 2.0)
        except Exception:
            duration = 2.0
        if duration < 0:
            raise ValueError("wait action duration은 0 이상이어야 합니다.")
        time.sleep(duration)
        return {
            "index": idx,
            "action": action,
            "description": action_desc,
            "success": True,
            "verify": {"reason": "wait"},
            "trace_image": None
        }, None, 200
    else:
        trace_image = inspector.capture_trace()
        return None, {
            "status": "error",
            "success": False,
            "message": f"{idx + 1}번째 step의 action이 유효하지 않습니다: {action}",
            "step": {
                "index": idx,
                "action": action,
                "description": action_desc,
                "success": False,
                "verify": {"error": f"유효하지 않은 액션: {action}"},
                "trace_image": trace_image,
            },
            "trace_image": trace_image,
        }, 400

    target_for_verify = None
    if action == 'tap_structure':
        target_for_verify = {**(step.get('target') or {}), "selector": step.get('selector')}
    is_success, verify_details = inspector.verify_action_success(before_hierarchy, target_for_verify)
    step_log = {
        "index": idx,
        "action": action,
        "description": action_desc,
        "success": is_success,
        "verify": verify_details,
        "trace_image": None,
    }

    if not is_success:
        trace_image = inspector.capture_trace()
        step_log["trace_image"] = trace_image
        return None, {
            "status": "error",
            "success": False,
            "message": f"{idx + 1}번째 step 실행 실패",
            "step": step_log,
            "trace_image": trace_image,
        }, 400

    return step_log, None, 200

@csrf_exempt
@api_view(['POST'])
def stop_steps(request):
    """시나리오 재생 중단"""
    global STOP_SIGNAL
    STOP_SIGNAL = True
    return JsonResponse({"status": "success"})


@csrf_exempt
@api_view(['POST'])
def execute_single_step(request):
    """Play 탭용 단일 step 실행 API"""
    global STOP_SIGNAL
    if request.data.get('reset_stop', False):
        STOP_SIGNAL = False

    step = request.data.get('step')
    idx = request.data.get('index', 0)
    device = deviceManager.getDevice()

    if not device:
        return JsonResponse({"status": "error", "success": False, "message": "기기 연결 안됨"}, status=400)
    if not isinstance(step, dict):
        return JsonResponse({"status": "error", "success": False, "message": "step payload가 올바르지 않습니다."}, status=400)

    try:
        step_log, error_body, status_code = _execute_single_step_core(step, idx, device)
        if error_body:
            return JsonResponse(error_body, status=status_code)
        return JsonResponse({"status": "success", "success": True, "step": step_log}, status=200)
    except Exception as e:
        trace_image = inspector.capture_trace()
        return JsonResponse(
            {
                "status": "error",
                "success": False,
                "message": f"{idx + 1}번째 step 처리 중 예외 발생: {e}",
                "step": {
                    "index": idx,
                    "action": step.get('action') if isinstance(step, dict) else 'unknown',
                    "success": False,
                    "verify": {"error": f"예외 발생: {str(e)}"},
                    "trace_image": trace_image,
                },
                "trace_image": trace_image,
            },
            status=500,
        )


# ---------------------------------------------------------
# 💡 대망의 Play 실행 & 검증 엔진 (중복 리턴 제거 완료!)
# ---------------------------------------------------------
@csrf_exempt
@api_view(['POST'])
def execute_scenario(request):
    """Play 탭에서 전달된 시나리오를 실행하고 스텝별 로그/최종 T/F를 반환"""
    global STOP_SIGNAL
    STOP_SIGNAL = False

    payload = request.data.get('scenario', {}) or {}
    steps = payload.get('steps', []) or []
    device = deviceManager.getDevice()

    # 1. 기기 연결 에러 (중복 리턴 해결)
    if not device:
        return JsonResponse({
            "status": "error",
            "success": False,
            "message": "기기 연결 안됨",
            "steps": [],
            "trace_image": None,
            "final": {"success": False}
        }, status=400)

    # 2. 스텝 없음 에러 (중복 리턴 해결)
    if not isinstance(steps, list) or len(steps) == 0:
        return JsonResponse({
            "status": "error",
            "success": False,
            "message": "실행할 step이 없습니다.",
            "steps": [],
            "trace_image": None,
            "final": {"success": False}
        }, status=400)

    step_results = []

    for idx, step in enumerate(steps):
        if STOP_SIGNAL:
            return JsonResponse(
                {
                    "status": "stopped",
                    "success": False,
                    "message": "사용자에 의해 실행이 중단되었습니다.",
                    "steps": step_results,
                    "trace_image": None,
                    "final": {"success": False, "stopped": True},
                    "stopped": True,
                },
                status=200,
            )
        try:
            step_log, error_body, status_code = _execute_single_step_core(step, idx, device)
            if error_body:
                if error_body.get("step"):
                    step_results.append(error_body["step"])
                return JsonResponse(
                    {
                        "status": error_body.get("status", "error"),
                        "success": False,
                        "message": error_body.get("message", "step 실행 실패"),
                        "steps": step_results,
                        "trace_image": error_body.get("trace_image"),
                        "final_scenario": payload,
                        "final": {"success": False, "stopped": error_body.get("stopped", False)},
                        "stopped": error_body.get("stopped", False),
                    },
                    status=status_code,
                )

            step_results.append(step_log)
        except Exception as e:
            trace_image = inspector.capture_trace()
            step_results.append({
                "index": idx, "action": action if 'action' in locals() else 'unknown',
                "success": False, "verify": {"error": f"예외 발생: {str(e)}"}, "trace_image": trace_image
            })
            return JsonResponse({
                "status": "error", "success": False,
                "message": f"{idx + 1}번째 step 처리 중 예외 발생: {e}",
                "steps": step_results, "trace_image": trace_image, "final": {"success": False}
            }, status=500)

    # 3. 모든 스텝이 무사히 끝났을 때의 최종 성공 응답
    return JsonResponse({
        "status": "success",
        "success": True,
        "message": f"{len(steps)}개 step 실행 완료",
        "steps": step_results,
        "trace_image": None,
        "final_scenario": payload,
        "final": {"success": True}
    })

def get_hierarchy(request):
    """현재 화면의 요소(UI 트리) 정보를 JSON으로 반환"""
    if request.method == 'GET':
        try:
            elements = inspector.get_smart_hierarchy()
            return JsonResponse({"success": True, "elements": elements})
        except Exception as e:
            return JsonResponse({"success": False, "message": str(e)}, status=500)


@csrf_exempt
@api_view(['POST'])
def reconnect_device(request):
    """꼬여버린 ADB 서버를 강제로 죽이고 새로 연결하는 마법의 API"""
    try:
        print("🔄 [ADB 초기화] ADB 서버 강제 종료 및 재연결 시도 중...")
        
        # 1. 터미널 명령어로 좀비 ADB 프로세스 완벽히 사살
        subprocess.run(["adb", "kill-server"], check=False)
        
        # 2. ADB 서버 새 숨결 불어넣기
        subprocess.run(["adb", "start-server"], check=False)
        
        # 3. deviceManager 안의 낡은 객체를 버리고 강제로 새 연결 덮어쓰기!
        deviceManager.device = u2.connect() 
        
        # 4. 연결 테스트
        w, h = deviceManager.device.window_size()
        print(f"✅ [ADB 초기화 성공] 기기 재연결 완료! 해상도: {w}x{h}")
        
        return JsonResponse({"status": "success", "message": "ADB 재연결 성공"})
        
    except Exception as e:
        print(f"❌ [ADB 초기화 실패]: {e}")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)
