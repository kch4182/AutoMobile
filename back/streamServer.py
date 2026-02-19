import cv2
import numpy as np
from flask import Flask, Response
from adbutils import adb
import time

app = Flask(__name__)

def generate_frames():
    device = adb.device()
    while True:
        # 캡처 시간을 줄이기 위해 퀄리티 타협
        pill_img = device.screenshot()
        frame = np.array(pill_img)
        frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # 절반 크기로 줄이기 (계산량이 줄어듭니다)
        frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)

        # 압축 퀄리티를 40~50 정도로 낮추기 (움직임이 훨씬 부드러워집니다)
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 50])
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
        
        # 딜레이를 더 줄임
        time.sleep(0.01)

@app.route('/stream')
def stream():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    # 5000번 포트로 실행
    app.run(host='0.0.0.0', port=5000, threaded=True)