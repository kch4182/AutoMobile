"""
앱 종속 설정을 이 파일로만 분리합니다.

다른 앱에 재사용할 때는 아래 3개 변수만 수정하면,
백엔드 자동화 로직(리셋/런치/실행)이 그대로 동작하도록 설계합니다.
"""

# Target App
PACKAGE_NAME = "com.vetching.plusvetm.development"
MAIN_ACTIVITY_PATH = "com.vetching.plusvetm.MainActivity"

# Reset Intent Command (soft reset: clear task & new task)
# NOTE: `automationController.reset_app()`에서 그대로 사용됩니다.
RESET_INTENT_COMMAND = (
    f"am start -n {PACKAGE_NAME}/{MAIN_ACTIVITY_PATH} "
    f"--activity-clear-task --activity-new-task"
)

