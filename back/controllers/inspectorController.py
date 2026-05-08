from django.http import JsonResponse
from rest_framework.decorators import api_view
from services.inspectorService import inspector



@api_view(['GET'])
def get_ui_tree(request):
    """[스마트 인스펙터] 화면 요소 분석 API (Controller는 Service만 호출함)"""
    try:
        # 모든 복잡한 분석 로직(동적/정적 판별, Row 분류)은 서비스가 알아서 처리!
        elements = inspector.get_smart_hierarchy()
        
        if not elements:
            return JsonResponse({"status": "error", "message": "요소를 추출하지 못했습니다.", "elements": []}, status=400)
            
        return JsonResponse({"status": "success", "elements": elements})
        
    except Exception as e:
        print(f"❌ UI Tree API 에러: {e}")
        return JsonResponse({"status": "error", "message": str(e)}, status=500)