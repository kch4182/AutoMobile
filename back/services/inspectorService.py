import xml.etree.ElementTree as ET
import re
import time
import os
from datetime import datetime
from .deviceService import deviceManager

# constants.py 단어장
from .constants import STATIC_KEYWORDS 

class InspectorService:
    def _get_center_from_bounds(self, bounds):
        if not bounds or len(bounds) != 4:
            return None
        x1, y1, x2, y2 = bounds
        return ((x1 + x2) // 2, (y1 + y2) // 2)

    def _bounds_close_enough(self, left_bounds, right_bounds, tolerance=24):
        if not left_bounds or not right_bounds or len(left_bounds) != 4 or len(right_bounds) != 4:
            return False
        return all(abs(int(a) - int(b)) <= tolerance for a, b in zip(left_bounds, right_bounds))

    def _find_static_candidate_in_hierarchy(self, target, selector=None):
        selector = selector or {}
        fallback = target.get('fallback') or {}
        fallback_bounds = fallback.get('bounds')

        class_name = target.get('class_name')
        text_anchor = target.get('text_anchor')
        resource_id = target.get('resource_id') or selector.get('resource_id')
        content_desc = target.get('content_desc') or selector.get('content_desc')
        text_value = target.get('text') or selector.get('text')

        candidates = []
        for el in self.get_smart_hierarchy():
            if el.get('is_dynamic'):
                continue
            if class_name and el.get('class') != class_name:
                continue
            if resource_id and el.get('resource_id') != resource_id:
                continue
            if content_desc and el.get('content_desc') != content_desc:
                continue
            if text_anchor and not (
                el.get('content_desc') == text_anchor or el.get('text') == text_anchor
            ):
                continue
            if text_value and el.get('text') != text_value:
                continue
            candidates.append(el)

        if not candidates:
            return None

        if fallback_bounds:
            for candidate in candidates:
                if self._bounds_close_enough(candidate.get('bounds'), fallback_bounds):
                    return candidate

        return candidates[0]

    def _find_static_target_center(self, device, target, selector=None, current_pkg=None):
        text_anchor = target.get('text_anchor')
        class_name = target.get('class_name')
        
        # 💡 프론트에서 넘어온 ID와 설명 추가 추출!
        resource_id = target.get('resource_id') or (selector and selector.get('resource_id'))
        content_desc = target.get('content_desc') or (selector and selector.get('content_desc'))

        search_kwargs = {}
        if current_pkg:
            search_kwargs['packageName'] = current_pkg
        if class_name:
            search_kwargs['className'] = class_name

        # 🚀 하이패스 1: resource_id가 있으면 최우선으로 초고속 탐색
        if resource_id:
            found_res = device(resourceId=resource_id, **search_kwargs)
            if found_res.exists:
                return found_res.center()

        # 🚀 하이패스 2: content_desc(설명)가 있으면 초고속 탐색
        if content_desc:
            found_desc_exact = device(description=content_desc, **search_kwargs)
            if found_desc_exact.exists:
                return found_desc_exact.center()

        # 🚀 하이패스 3: 기존 텍스트 기반 탐색
        if text_anchor:
            found_desc = device(description=text_anchor, **search_kwargs)
            if found_desc.exists:
                return found_desc.center()

            found_text = device(text=text_anchor, **search_kwargs)
            if found_text.exists:
                return found_text.center()

        #  실패했을 때만 최후의 수단으로 전체 XML 탐색 진행
        candidate = self._find_static_candidate_in_hierarchy(target, selector)
        if candidate:
            return self._get_center_from_bounds(candidate.get('bounds'))

        return None

    def capture_trace(self):
        """실패 상황 스크린샷을 저장하고 상대 경로를 반환"""
        device = deviceManager.getDevice()
        if not device:
            print("⚠️ [Trace] 디바이스 연결이 없어 스크린샷 저장 불가")
            return None

        try:
            back_dir = os.path.dirname(os.path.dirname(__file__))
            traces_dir = os.path.join(back_dir, "media", "traces")
            os.makedirs(traces_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            filename = f"trace_{timestamp}.png"
            absolute_path = os.path.join(traces_dir, filename)
            relative_path = f"media/traces/{filename}"

            screenshot_result = device.screenshot(absolute_path)

            # 일부 드라이버는 이미지 객체를 반환하므로 저장을 보장
            if hasattr(screenshot_result, "save"):
                screenshot_result.save(absolute_path)

            print(f"📸 [Trace] 실패 화면 저장 완료: {relative_path}")
            return relative_path
        except Exception as e:
            print(f"⚠️ [Trace] 실패 화면 저장 중 에러 발생: {e}")
            return None

    def _is_target_present(self, target, selector=None):
        """타겟 요소가 현재 화면에 존재하는지 확인"""
        if not target:
            return False

        device = deviceManager.getDevice()
        if not device:
            return False

        try:
            text_anchor = target.get('text_anchor')
            row_index = target.get('row_index')
            class_name = target.get('class_name')

            if not target.get('is_dynamic'):
                center = self._find_static_target_center(device, target, selector)
                if center:
                    return True

            if target.get('is_dynamic') and row_index is not None:
                elements = self.get_smart_hierarchy()
                for el in elements:
                    if not el.get('is_dynamic'):
                        continue
                    if el.get('row_index') != row_index:
                        continue
                    if class_name and el.get('class') != class_name:
                        continue
                    return True

            return False
        except Exception as e:
            print(f"⚠️ 타겟 존재 여부 확인 실패: {e}")
            return False

    def verify_action_success(self, before_hierarchy, target=None):
        """
        순수 판정 함수:
        - capture_trace() 같은 side-effect를 발생시키지 않고
        - (is_success: bool, verify_details: dict)만 반환한다.
        """
        device = deviceManager.getDevice()

        if not device:
            return False, {
                "reason": "no_device",
                "hierarchy_changed": False,
                "target_was_present": None,
                "target_is_present": None,
            }

        if not before_hierarchy:
            return False, {
                "reason": "missing_before_hierarchy",
                "hierarchy_changed": False,
                "target_was_present": None,
                "target_is_present": None,
            }

        try:
            poll_interval = 0.5
            max_wait_seconds = 3
            attempts = int(max_wait_seconds / poll_interval)

            selector = target.get('selector') if isinstance(target, dict) else None
            target_was_present = self._is_target_present(target, selector) if target else None
            target_is_present_after = target_was_present
            hierarchy_changed = False

            for _ in range(attempts):
                after_hierarchy = device.dump_hierarchy()

                if after_hierarchy != before_hierarchy:
                    hierarchy_changed = True
                    break

                if target and target_was_present:
                    # "클릭 후 사라짐" 패턴을 위해 타겟 유무를 폴링
                    target_is_present_after = self._is_target_present(target, selector)
                    if not target_is_present_after:
                        break

                time.sleep(poll_interval)

            if hierarchy_changed:
                return True, {
                    "reason": "hierarchy_changed",
                    "hierarchy_changed": True,
                    "target_was_present": target_was_present,
                    "target_is_present": target_is_present_after,
                }

            if target and target_was_present and target_is_present_after is False:
                return True, {
                    "reason": "target_disappeared",
                    "hierarchy_changed": False,
                    "target_was_present": target_was_present,
                    "target_is_present": target_is_present_after,
                }

            if target and target_was_present and target_is_present_after is True:
                return True, {
                    "reason": "already_at_target",
                    "hierarchy_changed": False,
                    "target_was_present": target_was_present,
                    "target_is_present": target_is_present_after,
                }

            return False, {
                "reason": "no_change_timeout",
                "hierarchy_changed": False,
                "target_was_present": target_was_present,
                "target_is_present": target_is_present_after,
            }

        except Exception as e:
            return False, {
                "reason": "verification_error",
                "hierarchy_changed": False,
                "target_was_present": None,
                "target_is_present": None,
                "error": str(e),
            }

    def get_smart_hierarchy(self):
        """
        [Studio용] Y좌표 그룹핑 + 화이트리스트 기반 범용 동적/정적 판별기
        (업데이트: 이름 없는 아이콘, 버튼 등 클릭 가능한 모든 요소 스캔)
        """
        device = deviceManager.getDevice()
        if not device:
            return []

        try:
            xmlData = device.dump_hierarchy()
            root = ET.fromstring(xmlData)
            
            raw_elements = []
            max_y = 0

            # 1. 화면의 모든 요소를 긁어모음
            for node in root.iter('node'):
                bounds_str = node.get('bounds', '')
                if not bounds_str or bounds_str == '[0,0][0,0]': continue

                matches = re.findall(r'\d+', bounds_str)
                if len(matches) != 4: continue
                bounds = [int(m) for m in matches]
                if bounds[2] <= bounds[0] or bounds[3] <= bounds[1]: continue

                if bounds[3] > max_y: 
                    max_y = bounds[3]

                text = node.get('text', '')
                content_desc = node.get('content-desc', '')
                display_text = (content_desc if content_desc else text).strip()
                
                class_name = node.get('class', '')
                is_clickable = node.get('clickable') == 'true'

                # 💡 [핵심 변경 1] 글자가 있거나, 클릭 가능하거나, 이미지/버튼이면 무조건 수집!
                if display_text or is_clickable or "ImageView" in class_name or "Button" in class_name:
                    raw_elements.append({
                        "resource_id": node.get('resource-id', ''),
                        "class": class_name,
                        "text": text,
                        "content_desc": content_desc,
                        "bounds": bounds,
                        "is_dynamic": False, 
                        "row_index": None
                    })

            # 💡 [핵심 2] Y 중심 좌표를 기준으로 요소들을 '가로줄(Row)'로 묶어줌
            raw_elements.sort(key=lambda x: (x['bounds'][1] + x['bounds'][3]) / 2)
            
            rows = []
            current_row = []
            last_y = -1

            # Y좌표 차이가 20px 이내면 같은 줄(Row)에 있는 것으로 간주
            for el in raw_elements:
                y_center = (el['bounds'][1] + el['bounds'][3]) / 2
                if last_y == -1 or abs(y_center - last_y) <= 20:
                    current_row.append(el)
                else:
                    rows.append(current_row)
                    current_row = [el]
                last_y = y_center
            if current_row:
                rows.append(current_row)

            elements = []
            row_counter = 0

            # 3. 각 가로줄(Row)을 분석하며 동적/정적 판별
            for row in rows:
                # 같은 줄 안에서는 X좌표(왼쪽->오른쪽) 순으로 정렬
                row.sort(key=lambda x: x['bounds'][0]) 
                
                # 이 줄에 '동적 데이터'가 하나라도 포함되어 있는지 체크
                has_dynamic_in_row = False

                for el in row:
                    dt = (el['content_desc'] if el['content_desc'] else el['text']).strip()
                    y_center = (el['bounds'][1] + el['bounds'][3]) / 2
                    
                    # 네비게이션 방어: 화면 최상단/최하단(10%)은 무조건 고정!
                    is_nav_bar = y_center > max_y * 0.9 or y_center < max_y * 0.1

                    # 💡 [핵심 변경 2] 네비바에 있거나 단어장에 있으면 정적, 그 외(이름 없는 아이콘 포함)는 전부 동적!
                    if is_nav_bar or (dt and dt in STATIC_KEYWORDS):
                        el['is_dynamic'] = False
                        el['row_index'] = None
                    else:
                        el['is_dynamic'] = True
                        has_dynamic_in_row = True
                    
                    elements.append(el)
                
                # 이 줄(Row)에 동적 데이터가 있었다면, 해당 동적 요소들에게 같은 '줄 번호'를 부여함
                if has_dynamic_in_row:
                    for el in elements[-len(row):]: 
                        if el['is_dynamic']:
                            el['row_index'] = row_counter
                    row_counter += 1

            return elements

        except Exception as e:
            print(f"❌ Smart Hierarchy Error: {e}")
            return []
        
    def _dismiss_system_popups(self, device):
        """흔히 등장하는 시스템 팝업/재난문자의 버튼을 찾아 닫습니다."""
        popup_keywords = ['확인', '닫기', '허용', '취소', '나중에', 'OK', 'Close', 'Allow', 'Cancel']
        try:
            for keyword in popup_keywords:
                # 1. 텍스트로 찾기
                btn = device(text=keyword)
                if btn.exists:
                    btn.click(timeout=1)
                    print(f"🛡️ [팝업 무시] '{keyword}' 팝업 버튼 정리했습니다.")
                    time.sleep(0.8) # 팝업 닫히는 애니메이션 대기
                    return # 하나 닫았으면 일단 리턴 (루프가 또 돌면서 남은 팝업 확인)
                
                # 2. content-desc로 찾기
                btn_desc = device(description=keyword)
                if btn_desc.exists:
                    btn_desc.click(timeout=1)
                    print(f"🛡️ [팝업 무시] '{keyword}'(desc) 팝업 버튼 화면을 정리했습니다.")
                    time.sleep(0.8)
                    return
        except Exception as e:
            print(f"⚠️ [팝업 무시] 처리 중 에러 발생: {e}")

    def resolve_target_element(self, target, selector=None, stop_checker=None, ignore_system_popups=False):
        """[Play용] Studio에서 만든 '구조적 타겟(JSON)'을 해석하여 클릭 좌표 반환"""
        if not target: return None
        device = deviceManager.getDevice()
        if not device: return None

        print(f"🔍 요소 탐색 시작: {target}")
        try:
            fallback = target.get('fallback')
            text_anchor = target.get('text_anchor')
            row_index = target.get('row_index')
            class_name = target.get('class_name')

            # 💡 현재 활성화된 앱 패키지명을 가져와서 시스템 버튼 오작동 방지
            current_app = device.app_current()
            current_pkg = current_app.get('package') if current_app else None

            def _find_target_center():
                # 1) 고정 요소: 텍스트/접근성 라벨 기반 탐색
                if not target.get('is_dynamic'):
                    center = self._find_static_target_center(device, target, selector, current_pkg)
                    if center:
                        return center
                    if not text_anchor:
                        return None
                    
                    # 검색 조건 딕셔너리 생성 (우리 앱 안에서만 찾기)
                    search_kwargs = {}
                    if current_pkg:
                        search_kwargs['packageName'] = current_pkg
                    if class_name:
                        search_kwargs['className'] = class_name

                    found_desc = device(description=text_anchor, **search_kwargs)
                    if found_desc.exists:
                        return found_desc.center()

                    found_text = device(text=text_anchor, **search_kwargs)
                    if found_text.exists:
                        return found_text.center()

                # 2) 동적 요소: row_index 기반 탐색
                if target.get('is_dynamic') and row_index is not None:
                    elements = self.get_smart_hierarchy()
                    dynamic_candidates = []
                    for el in elements:
                        if not el.get('is_dynamic'):
                            continue
                        if el.get('row_index') != row_index:
                            continue
                        if class_name and el.get('class') != class_name:
                            continue
                        dynamic_candidates.append(el)

                    if dynamic_candidates:
                        preferred = dynamic_candidates[0]
                        return self._get_center_from_bounds(preferred.get('bounds'))

                return None

            # --- 1단계: 대기 탐색 (10초, 0.5초 간격) ---
            print("⏳ [Wait] 최대 10초 동안 대상 요소 출현 대기 중...")
            wait_attempts = int(10 / 0.5)
            for attempt in range(wait_attempts):
                # 🛑 [브레이크 1] 대기 루프 중단
                if stop_checker and stop_checker():
                    print("🛑 [STOP] 대기 루프 즉시 중단!")
                    return None

                # 💡 [팝업 무시 로직] 타겟을 찾기 전에 팝업이 있는지 먼저 확인하고 치움!
                if ignore_system_popups:
                    self._dismiss_system_popups(device)

                center = _find_target_center()
                if center:
                    print(f"✅ [Wait] 요소 탐색 성공: {center}")
                    return center
                print(f"   ↳ [Wait] {attempt + 1}/{wait_attempts}회 확인: 미발견")
                time.sleep(0.5)

            # 스크롤을 위한 화면 크기 조회
            width, height = device.window_size()
            center_x = width // 2

            # --- 2단계-A: 세로 탐색 (최대 5회) ---
            print("📜 [Scroll-Vertical] 세로 스와이프 탐색 시작 (최대 5회)")
            for attempt in range(5):
                # 🛑 [브레이크 2] 세로 스크롤 중단
                if stop_checker and stop_checker():
                    print("🛑 [STOP] 세로 스와이프 루프 즉시 중단!")
                    return None

                start_y = int(height * 0.7)
                end_y = int(height * 0.3)
                print(f"   ↳ [Scroll-Vertical] {attempt + 1}/5회 스와이프 실행")
                device.swipe(center_x, start_y, center_x, end_y, 0.2)
                time.sleep(1)

                center = _find_target_center()
                if center:
                    print(f"✅ [Scroll-Vertical] 요소 탐색 성공: {center}")
                    return center

            # --- 2단계-B: 가로 탐색 (fallback y 기반, 최대 5회) ---
            fallback_y = fallback.get('y') if fallback else None
            if fallback_y is not None:
                horizontal_y = max(0, min(height - 1, int(fallback_y)))
                print(f"↔️ [Scroll-Horizontal] y={horizontal_y} 고정 가로 스와이프 탐색 시작 (최대 5회)")
                for attempt in range(5):
                    # 🛑 [브레이크 3] 가로 스크롤 중단
                    if stop_checker and stop_checker():
                        print("🛑 [STOP] 가로 스와이프 루프 즉시 중단!")
                        return None

                    start_x = int(width * 0.9)
                    end_x = int(width * 0.1)
                    print(f"   ↳ [Scroll-Horizontal] {attempt + 1}/5회 스와이프 실행")
                    device.swipe(start_x, horizontal_y, end_x, horizontal_y, 0.2)
                    time.sleep(1)

                    center = _find_target_center()
                    if center:
                        print(f"✅ [Scroll-Horizontal] 요소 탐색 성공: {center}")
                        return center

            # --- 3단계: 최후 보루(Fallback) ---
            if fallback and fallback.get('x') is not None and fallback.get('y') is not None:
                print(f"⚠️ [Fallback] 탐색 실패. 좌표 반환: ({fallback['x']}, {fallback['y']})")
                return (fallback['x'], fallback['y'])

            print("❌ [Fallback] 유효한 fallback 좌표가 없어 요소를 찾지 못했습니다.")
            return None

        except Exception as e:
            print(f"❌ 요소 탐색 중 에러 발생: {e}")
            return None

inspector = InspectorService()
