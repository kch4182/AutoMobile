import uiautomator2 as u2
import xml.dom.minidom
import os
import platform
import subprocess

def fetch_and_save_xml():
    print("📱 기기 연결 시도 중...")

    try:
        # 1. 기기 연결
        d = u2.connect() 
        print(f"✅ 연결됨: {d.info.get('productName')} (Serial: {d.serial})")

        # 2. XML 덤프
        print("📥 화면 XML 추출 중... (잠시만 기다려주세요)")
        raw_xml = d.dump_hierarchy(compressed=False)

        if raw_xml:
            # 3. 예쁘게 정렬
            dom = xml.dom.minidom.parseString(raw_xml)
            pretty_xml = dom.toprettyxml(indent="  ")

            # 4. 파일 저장 (절대 경로로 변환)
            filename = "current_screen.xml"
            # 현재 스크립트가 있는 폴더의 절대 경로를 구합니다.
            full_path = os.path.abspath(filename)

            with open(full_path, "w", encoding="utf-8") as f:
                f.write(pretty_xml)
            
            print(f"💾 저장 완료!")
            print(f"📂 파일 경로: {full_path}")
            print("-" * 30)

            # 5. [추가된 기능] 파일이 있는 폴더 열기 & 파일 선택
            open_file_in_explorer(full_path)

            # 6. [선택] 파일 바로 열기 (브라우저/VSCode 등 기본 앱으로 실행)
            # 귀찮으면 아래 줄 주석 처리하세요
            os.startfile(full_path) 

        else:
            print("❌ XML 데이터를 가져오지 못했습니다.")

    except Exception as e:
        print(f"❌ 에러 발생: {e}")

def open_file_in_explorer(path):
    """
    OS에 맞춰 파일 탐색기를 열고 해당 파일을 선택합니다.
    """
    system_name = platform.system()
    try:
        if system_name == "Windows":
            # 윈도우: 탐색기를 열고 파일을 선택한 상태로 보여줌
            subprocess.Popen(f'explorer /select,"{path}"')
        elif system_name == "Darwin":  # macOS
            subprocess.call(["open", "-R", path])
        else:  # Linux
            subprocess.call(["xdg-open", os.path.dirname(path)])
        print("🚀 파일 탐색기를 실행했습니다.")
    except Exception as e:
        print(f"⚠️ 탐색기 열기 실패: {e}")

if __name__ == "__main__":
    fetch_and_save_xml()