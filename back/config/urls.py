from django.contrib import admin
from django.http import JsonResponse
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static

from controllers import automationController
from controllers import streamController
from controllers import inspectorController
from controllers import dashboardController
from controllers.automationController import reconnect_device


def api_root(request):
    return JsonResponse({"status": "success", "message": "API server is running"})

urlpatterns = [
    path('', api_root),
    path('admin/', admin.site.urls),

    # 1. 기기 정보 & 앱 실행
    path('device-info/', automationController.device_info),
    path('launch/', automationController.launch_app), 
    
    # 2. 수동 제어 (클릭, 스와이프, 텍스트)
    path('tap/', automationController.tap_device),
    path('swipe/', automationController.swipe_device),
    path('text/', automationController.type_text),
    
    # 3. AI 제어
    path('ask-ai/', automationController.ask_ai_action), 
    path('api/ai/verify/', automationController.verify_ai_key),
    
    # 4. 시나리오 재생
    path('run-steps/', automationController.run_steps),
    path('stop-steps/', automationController.stop_steps),
    path('api/execute', automationController.execute_scenario),
    path('api/execute-step/', automationController.execute_single_step),
    path('reset-app/', automationController.reset_app),
    path('api/projects/', automationController.projects_api),
    path('api/projects/<int:project_id>/', automationController.project_detail_api),
    path('api/scenarios/', automationController.scenarios_api),
    path('api/scenarios/<int:scenario_id>/', automationController.scenario_detail_api),
    path('api/scenarios/import/', automationController.scenario_import_api),
    path('api/safe-go-home/', automationController.safe_go_home_api),
    path('api/reset-target/', automationController.reset_target_api),
    path('api/reset-target/apply/', automationController.apply_reset_target_api),
    path('api/current-app-info/', automationController.current_app_info),

    # 5. 영상 스트리밍 경로 추가
    path('stream/', streamController.stream_video),

    # 6. 인스펙터를 위한 새로운 API 엔드포인트
    path('get-ui-tree/', inspectorController.get_ui_tree, name='get_ui_tree'),

    # 7. 텍스트 입력 API (스마트 타이핑)
    path('text/', automationController.type_text, name='type_text'),

    # 8. 읽은 요소 화면에 쏴주는 통로
    path('api/hierarchy/', automationController.get_hierarchy),

    # 9. Dashboard 실행 이력 API
    path('api/dashboard/runs/', dashboardController.dashboard_runs_api),
    path('api/dashboard/runs/save/', dashboardController.dashboard_run_save_api),
    path('api/dashboard/runs/<int:run_id>/', dashboardController.dashboard_run_detail_api),
    path('api/dashboard/suites/', dashboardController.dashboard_suites_api),
    path('api/dashboard/suites/<int:suite_id>/', dashboardController.dashboard_suite_delete_api),
    path('api/dashboard/heal/approve/', dashboardController.approve_heal_api),

    # 10. 디바이스 재연결 API
    path('api/device/reconnect/', reconnect_device, name='reconnect_device'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
