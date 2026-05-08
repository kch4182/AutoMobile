import threading
import asyncio
from prisma import Prisma

_thread_local = threading.local()

async def ensure_prisma_connected() -> Prisma:
    # 1. 현재 안전하게 살아있는(Running) 이벤트 루프를 가져옴
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
    current_loop_id = id(loop)

    # 2. DB 객체가 없거나, '이미 파괴된 옛날 루프(loop_id 다름)'에 묶여있다면 버리고 새로 만듦
    if not hasattr(_thread_local, 'db') or getattr(_thread_local, 'loop_id', None) != current_loop_id:
        _thread_local.db = Prisma()
        _thread_local.loop_id = current_loop_id

    # 3. 안전한 새 루프 환경에서 DB를 연결
    if not _thread_local.db.is_connected():
        await _thread_local.db.connect()

    return _thread_local.db