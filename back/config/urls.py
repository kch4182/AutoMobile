from django.contrib import admin
from django.urls import path

from controllers import automationController
from controllers import streamController

urlpatterns = [
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
    
    # 4. 시나리오 재생
    path('run-steps/', automationController.run_steps),
    path('stop-steps/', automationController.stop_steps),

    # 🆕 영상 스트리밍 경로 추가
    path('stream/', streamController.stream_video),
]