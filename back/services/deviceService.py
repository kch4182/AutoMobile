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
                self.device = u2.connect()
                print("📱 Device Connected via DeviceService")
            except Exception as e:
                print(f"❌ Connection Error: {e}")
                self.device = None
        return self.device

    def smartTypeText(self, text):
        """
        🤖 스마트 입력: [현재 키보드 저장] -> [ADB 키보드 전환] -> [입력] -> [복구]
        """
        device = self.getDevice()
        if not device: 
            return False

        try:
            # 1. 현재 사용 중인 키보드 ID 저장 (예: 삼성 키보드)
            currentImeRes = device.shell("settings get secure default_input_method")
            # uiautomator2 버전에 따라 output 속성이 있을 수도, 없을 수도 있음
            currentIme = currentImeRes.output.strip() if hasattr(currentImeRes, 'output') else str(currentImeRes).strip()

            print(f"🔄 Switching Keyboard: {currentIme} -> ADB Keyboard")

            # 2. ADB 키보드로 전환 & 대기 (타이밍 중요!)
            device.shell("ime set com.android.adbkeyboard/.AdbIME")
            time.sleep(1.0) 

            # 3. 텍스트 입력 (한글 깨짐 방지 Broadcast)
            print(f"⌨️ Typing: {text}")
            device.shell(f"am broadcast -a ADB_INPUT_TEXT --es msg '{text}'")
            time.sleep(1.0) 

            # 4. 원래 키보드로 복구
            print(f"🔄 Restoring Keyboard: -> {currentIme}")
            device.shell(f"ime set {currentIme}")
            
            return True
            
        except Exception as e:
            print(f"⚠️ Smart Typing Error: {e}")
            # 에러 발생 시에도 입력은 시도해봄 (키보드 전환 없이)
            device.shell(f"am broadcast -a ADB_INPUT_TEXT --es msg '{text}'")
            return False

    def click(self, x, y):
        """
        단순 좌표 클릭 (Controller에서 깔끔하게 호출하기 위해 래핑)
        """
        device = self.getDevice()
        if device:
            device.click(x, y)
            return True
        return False

# 싱글톤 인스턴스 생성 (외부에서는 이 객체를 import해서 사용)
deviceManager = DeviceService()