import time
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view

# 💡 Service Layer 연결 (대소문자 정확히 맞춤)
from services.aiService import AiAgent
from services.inspectorService import inspector
from services.deviceService import deviceManager

# 시나리오 중단 신호 (Global State)
STOP_SIGNAL = False

@api_view(['GET'])
def device_info(request):
    """기기 화면 해상도 정보 반환"""
    device = deviceManager.getDevice()
    if device:
        w, h = device.window_size()
        return JsonResponse({"status": "success", "width": w, "height": h})
    return JsonResponse({"status": "error", "message": "기기 연결 실패"}, status=400)

@csrf_exempt
@api_view(['POST'])
def launch_app(request):
    """특정 앱 강제 종료 후 재실행 (Monkey 사용)"""
    package = request.data.get('package')
    device = deviceManager.getDevice()
    
    if device and package:
        try:
            device.shell(f"am force-stop {package}")
            time.sleep(0.5)
            # Monkey 명령어로 앱 실행
            device.shell(f"monkey -p {package} -c android.intent.category.LAUNCHER 1")
            return JsonResponse({"status": "success"})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=500)
            
    return JsonResponse({"status": "error", "message": "기기 또는 패키지명 없음"}, status=400)

@csrf_exempt
@api_view(['POST'])
def tap_device(request):
    """[수동 클릭] 좌표 클릭 및 해당 요소 정보 반환"""
    x = request.data.get('x')
    y = request.data.get('y')
    
    if x is None or y is None:
        return JsonResponse({"status": "error", "message": "좌표 누락"})

    # DeviceService를 통해 클릭
    if deviceManager.click(x, y):
        # 클릭한 위치의 요소 정보 가져오기 (Self-Healing용 데이터)
        elInfo = inspector.getElementAttributes(x, y)
        return JsonResponse({"status": "success", "element": elInfo})
        
    return JsonResponse({"status": "error", "message": "클릭 실패"})

@csrf_exempt
@api_view(['POST'])
def swipe_device(request):
    """드래그/스와이프 동작 수행"""
    d = request.data
    device = deviceManager.getDevice()
    
    if device and all(k in d for k in ['x1', 'y1', 'x2', 'y2']):
        # duration=0.2초로 부드럽게 스와이프
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

    # DeviceService의 스마트 입력 기능 사용
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

    # 1. 화면 분석 (InspectorService)
    uiElements = inspector.getSimplifiedHierarchy()
    
    # 2. AI 판단 (AiService)
    # 👇 [주의] AiAgent.GetCoordinates (대문자) 확인!
    aiResult = AiAgent.GetCoordinates(userPrompt, uiElements)

    if aiResult:
        msgType = aiResult.get('type', 'chat')

        # 🅰️ Action: 클릭
        if msgType == 'action':
            x, y = aiResult.get('x'), aiResult.get('y')
            summary = aiResult.get('summary', 'AI Action')
            
            # 요소 정보 확보
            elementInfo = inspector.getElementAttributes(x, y)
            
            # 클릭 실행
            deviceManager.click(x, y)
            
            return JsonResponse({
                "status": "success", "mode": "action",
                "x": x, "y": y, "summary": summary,
                "message": f"✅ {summary} (완료)", 
                "element": elementInfo
            })

        # 🅱️ Input: 텍스트 입력
        elif msgType == 'input':
            text = aiResult.get('text', '')
            summary = aiResult.get('summary', 'Input')
            
            # 스마트 입력 실행
            deviceManager.smartTypeText(text)
            
            return JsonResponse({
                "status": "success", "mode": "input",
                "input_text": text, "summary": summary,
                "message": f"✅ 입력: {text}"
            })

        # 🅾️ Chat: 대화
        else:
            return JsonResponse({
                "status": "success", "mode": "chat", 
                "message": aiResult.get('message')
            })

    return JsonResponse({"status": "error", "message": "AI 응답 없음"})

@csrf_exempt
@api_view(['POST'])
def run_steps(request):
    """시나리오 재생 (Action 리스트 실행)"""
    global STOP_SIGNAL
    STOP_SIGNAL = False
    
    steps = request.data.get('steps', [])
    device = deviceManager.getDevice()
    
    if not device:
        return JsonResponse({"status": "error", "message": "기기 연결 안됨"})

    for step in steps:
        if STOP_SIGNAL: break
        
        action = step.get('action')
        
        # 1. Tap (클릭)
        if action == 'tap':
            targetLabel = step.get('target_label') 
            pos = None
            
            # inspectorService 함수 호출
            if targetLabel:
                pos = inspector.findElementBySelector({'text': targetLabel})
            
            if pos:
                print(f"📍 Found element '{targetLabel}' at new pos: {pos}")
                device.click(pos[0], pos[1]) 
            else:
                device.click(step['x'], step['y'])
            
        # 2. Swipe (드래그)
        elif action == 'swipe':
            device.swipe(step['x1'], step['y1'], step['x2'], step['y2'], duration=0.2)
            
        # 3. Text (입력) - 스마트 타이핑 적용!
        elif action == 'text':
            text = step.get('text') or step.get('input_text') 
            if text:
                deviceManager.smartTypeText(text)
            
        # 딜레이
        time.sleep(1.2)

    return JsonResponse({"status": "success"})

@csrf_exempt
@api_view(['POST'])
def stop_steps(request):
    """시나리오 재생 중단"""
    global STOP_SIGNAL
    STOP_SIGNAL = True
    return JsonResponse({"status": "success"})