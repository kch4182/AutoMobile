import cv2
import numpy as np
from django.http import StreamingHttpResponse
from rest_framework.decorators import api_view
from services.deviceService import deviceManager
import time

def generate_frames():
    device = deviceManager.getDevice() 
    if not device:
        return
        
    while True:
        try:
            # 1. 스크린샷 캡처
            pill_img = device.screenshot()
            frame = np.array(pill_img)
            frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

            # 2. 리사이징 & 압축 (성능 최적화)
            frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
            ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])

            if not ret:
                continue

            # 3. 프레임 전송 (Generator)
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            # CPU 과부하 방지 딜레이
            time.sleep(0.02)
            
        except Exception as e:
            print(f"Stream Error: {e}")
            break

@api_view(['GET'])
def stream_video(request):
    return StreamingHttpResponse(generate_frames(), content_type='multipart/x-mixed-replace; boundary=frame')