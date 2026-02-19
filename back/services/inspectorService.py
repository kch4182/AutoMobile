import xml.etree.ElementTree as ET
import re
# 👇 아직 만들진 않았지만, 곧 만들 deviceService에서 기기 관리자를 가져옵니다.
from .deviceService import deviceManager

class InspectorService:
    def getSimplifiedHierarchy(self):
        """
        화면의 모든 요소를 스캔하여 JSON 리스트로 반환 (AI 분석용)
        """
        # DeviceService를 통해 연결된 기기 가져오기
        device = deviceManager.getDevice()
        if not device:
            return []

        try:
            # Hierarchy XML 덤프
            xmlData = device.dump_hierarchy()
            root = ET.fromstring(xmlData)

            elements = []
            for node in root.iter('node'):
                text = node.get('text', '')
                desc = node.get('content-desc', '')
                resId = node.get('resource-id', '')
                className = node.get('class', '')
                bounds = node.get('bounds')

                # 유의미한 정보가 있는 요소만 추출
                if (text or desc or resId) and bounds:
                    coords = re.findall(r'\d+', bounds)
                    if len(coords) == 4:
                        x1, y1, x2, y2 = map(int, coords)
                        width = x2 - x1
                        height = y2 - y1

                        # 너무 작은 요소 제외 및 중심 좌표 계산
                        if width > 0 and height > 0:
                            centerX = (x1 + x2) // 2
                            centerY = (y1 + y2) // 2

                            elements.append({
                                "text": text,
                                "desc": desc,
                                "id": resId,
                                "class": className,
                                "x": centerX,
                                "y": centerY
                            })
            return elements
        except Exception as e:
            print(f"❌ Hierarchy Error: {e}")
            return []

    def getElementAttributes(self, x, y):
        """
        클릭한 좌표(x,y)에 있는 UI 요소의 상세 속성을 추출 (Self-Healing용)
        """
        device = deviceManager.getDevice()
        if not device:
            return None

        try:
            xmlData = device.dump_hierarchy()
            root = ET.fromstring(xmlData)

            bestNode = None
            minArea = float('inf')

            # 클릭 좌표를 포함하는 가장 작은(구체적인) 요소 찾기
            for node in root.iter('node'):
                bounds = node.get('bounds')
                if bounds:
                    coords = re.findall(r'\d+', bounds)
                    if len(coords) == 4:
                        x1, y1, x2, y2 = map(int, coords)

                        if x1 <= x <= x2 and y1 <= y <= y2:
                            area = (x2 - x1) * (y2 - y1)
                            if area < minArea:
                                minArea = area
                                bestNode = node

            if bestNode is not None:
                return {
                    "text": bestNode.get('text', ''),
                    "resource_id": bestNode.get('resource-id', ''),
                    "content_desc": bestNode.get('content-desc', ''),
                    "class": bestNode.get('class', ''),
                    "bounds": bestNode.get('bounds')
                }
        except Exception as e:
            print(f"❌ Element Attribute Error: {e}")
        
        return None

    def findElementBySelector(self, selector):
        """
        🔍 저장된 속성(Text, ID)으로 현재 화면에서 요소 찾기 (재생 시 사용)
        """
        if not selector: return None
        
        device = deviceManager.getDevice()
        if not device: return None
        
        # 1. Resource ID로 찾기
        if selector.get('resource_id'):
            found = device(resourceId=selector['resource_id'])
            if found.exists: return found.center()
            
        # 2. Text로 찾기
        if selector.get('text'):
            found = device(text=selector['text'])
            if found.exists: return found.center()

        # 3. Description으로 찾기
        if selector.get('content_desc'):
            found = device(description=selector['content_desc'])
            if found.exists: return found.center()
            
        return None

# 싱글톤 인스턴스 생성
inspector = InspectorService()