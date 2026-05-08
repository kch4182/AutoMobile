import uiautomator2 as u2
import time

class DeviceService:
    def __init__(self):
        self.device = None

    def getDevice(self):
        """
        기기 연결 객체 반환 (연결 끊겨 있으면 재연결 시도)
        """
        if self.device is None:
            try:
                # USB로 연결된 기기나 앱플레이어를 자동으로 찾아서 연결합니다.
                self.device = u2.connect()
                print("📱 Device Connected via DeviceService")
            except Exception as e:
                print(f"❌ Connection Error: {e}")
                self.device = None
        return self.device

    def smartTypeText(self, text):
        """
        🤖 스마트 입력: [원래 키보드 저장] -> [send_keys 입력] -> [원래 키보드 복구]
        """
        device = self.getDevice()
        if not device: 
            return False

        try:
            # 1. 현재 사용 중인 키보드 ID(IME)를 미리 저장해둡니다.
            current_ime_res = device.shell("settings get secure default_input_method")
            current_ime = current_ime_res.output.strip() if hasattr(current_ime_res, 'output') else str(current_ime_res).strip()
            
            print(f"🔄 Backup Current Keyboard: {current_ime}")
            print(f"⌨️ Typing: {text}")

            # 2. uiautomator2의 내장 기능을 이용해 텍스트 입력
            # (이 과정에서 uiautomator2가 전용 IME로 잠시 전환할 수 있습니다)
            device.send_keys(text) 
            
            # 3. 입력이 완료된 후 약간의 시간 차를 두고 원래 키보드로 원상복구합니다.
            time.sleep(0.5)
            print(f"🔄 Restoring Keyboard: {current_ime}")
            device.shell(f"ime set {current_ime}")
            
            return True
            
        except Exception as e:
            print(f"⚠️ Typing Error: {e}")
            return False

    def click(self, x, y):
        """
        단순 좌표 클릭
        """
        device = self.getDevice()
        if device:
            device.click(x, y)
            return True
        return False

    def safe_go_home(self):
        """
        [Track 1] 하이브리드 범용 초기화 로직
        1. 패키지 이탈 확인 (앱 밖으로 나가면 즉시 재실행)
        2. 홈 버튼 탐색 (텍스트/설명 기반)
        3. 앱 내 좌측 상단 화살표 클릭 (Spatial 탐색)
        4. 최후의 수단 OS Back 실행
        """
        d = self.getDevice()
        if not d: return False

        # 💡 CEO님 앱의 정확한 패키지명 (이걸 기준으로 담장을 넘었는지 판단합니다)
        target_package = "com.vetching.plusvetm.development"
        home_keywords = ["홈", "Home", "HOME", "메인", "Main", "MAIN"]
        
        try:
            # 안드로이드 시스템에 직접 키보드 활성화 여부를 물어봅니다.
            res = d.shell("dumpsys input_method | grep mInputShown")
            if "mInputShown=true" in res.output:
                print("⌨️ 키보드가 켜져 있어 '뒤로가기'를 눌러 키보드를 숨깁니다.")
                d.press("back")
                time.sleep(1) # 키보드가 내려가는 애니메이션 대기 시간
        except Exception as e:
            print(f"⚠️ 키보드 상태 확인 중 에러 (무시하고 진행): {e}")
            

        def _try_click_home():
            """[시스템 UI 무시] 오직 우리 앱 패키지 내부의 홈 버튼만 클릭"""
            for kw in home_keywords:
                # 💡 핵심: packageName=target_package 조건을 추가해서 시스템 버튼(com.android.systemui)을 차단합니다.
                target_element = d(text=kw, packageName=target_package)
                if target_element.exists:
                    target_element.click()
                    print(f"✅ [App-Internal] 앱 내부 홈 텍스트({kw}) 클릭 완료")
                    return True
                
                target_desc = d(description=kw, packageName=target_package)
                if target_desc.exists:
                    target_desc.click()
                    print(f"✅ [App-Internal] 앱 내부 홈 아이콘({kw}) 클릭 완료")
                    return True
            return False

        def _try_click_in_app_back():
            """화면 좌측 상단(X<200, Y 50~350)에 있는 클릭 가능한 이미지 클릭"""
            try:
                # 💡 ImageView 중 클릭 가능한 것들만 필터링
                for elem in d(className="android.widget.ImageView", clickable=True):
                    info = elem.info
                    bounds = info.get('bounds', {})
                    if not bounds: continue
                    
                    center_x = (bounds['left'] + bounds['right']) // 2
                    center_y = (bounds['top'] + bounds['bottom']) // 2
                    
                    # 좌측 상단 영역 좌표 판정 (대부분의 앱 내 뒤로가기 위치)
                    if center_x < 200 and 50 < center_y < 350:
                        elem.click()
                        print("🔙 [Back] 앱 내 좌측 상단 화살표 클릭 성공")
                        return True
            except Exception as e:
                print(f"⚠️ [Back] 앱 내 뒤로가기 탐색 중 에러: {e}")
            return False

        # 최대 5번의 시도를 통해 홈 화면으로 복귀합니다.
        for attempt in range(5):
            # 🚨 [안전 장치] 패키지 체크 (구글 홈 등 런처로 나갔을 경우)
            current_pkg = d.info.get('currentPackageName')
            if current_pkg != target_package:
                print(f"🚨 [Escape] 앱 이탈 감지({current_pkg})! '{target_package}' 재실행.")
                d.app_start(target_package)
                time.sleep(2)
                return True # 재실행 자체가 초기화이므로 종료

            print(f"🔄 [Step {attempt + 1}] 홈 화면 복귀 시도 중...")

            # 1순위: 홈 버튼이 보이면 바로 누름
            if _try_click_home():
                time.sleep(1)
                return True

            # 2순위: 홈이 안 보이면 앱 내부 화살표 클릭
            if _try_click_in_app_back():
                time.sleep(1.5)
                continue # 한 칸 뒤로 갔으니 다시 처음부터(홈 확인) 실행

            # 3순위: 둘 다 없으면 OS Back (팝업/키보드 제거용)
            print("⚠️ [Wait] 홈/화살표 없음. OS Back 1회 실행")
            try:
                d.press("back")
            except:
                pass
            time.sleep(1.5)

        print("❌ [Fail] 5회 시도 후에도 홈 복귀 실패")
        return True


# 싱글톤 인스턴스 생성
deviceManager = DeviceService()