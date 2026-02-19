import json
import google.generativeai as genai
from groq import Groq
import re
import os


# 💡 모델 스위치 ("gemini" 또는 "groq")
PROVIDER = "gemini"  # "groq"

class aiService:
    def __init__(self):
        # 환경변수에서 API Key 로드 (없으면 None)
        self.gemini_key = os.getenv("GEMINI_API_KEY")
        self.groq_key = os.getenv("GROQ_API_KEY")
        
        # 기본 제공자 설정 (필요시 .env에서 가져오게 변경 가능)
        self.provider = PROVIDER 

    def GetCoordinates(self, user_prompt, ui_elements):
        """
        AI에게 화면 정보와 사용자 명령을 보내 좌표나 행동을 분석받음
        """
        system_instruction = """
        You are an intelligent Android Automation Agent.
        
        [YOUR GOAL]
        Analyze [Screen Elements] and [User Input].
        Classify intent into "Action", "Input", or "Chat".

        [CRITICAL RULES]
        1. ALWAYS RESPOND IN KOREAN.
        2. Return ONLY JSON.
        3. IF user wants to input text (e.g., "search for...", "type..."), USE "Type 2: Input".
           - RETURN THE EXACT STRING. DO NOT convert Korean to English QWERTY.
           - e.g., User: "조현석 입력해", Return: "조현석" (NOT "whgustjr")
        4. NEVER use "Type 1: Action" to click individual keyboard keys.
           - Always prefer "Type 2: Input" for text entry.

        [RESPONSE FORMAT - JSON ONLY]
        Type 1: Action (Click general buttons)
        {"type": "action", "x": <int>, "y": <int>, "summary": "버튼이름", "reason": "이유"}

        Type 2: Input (Text entry)
        {"type": "input", "text": "입력할단어", "summary": "텍스트 입력", "reason": "이유"}

        Type 3: Chat (General Conversation)
        {"type": "chat", "message": "답변내용"}
        """
        
        user_message = f"""
        [Screen Elements (Context)]
        {json.dumps(ui_elements, ensure_ascii=False)}

        [User Input (Command/Question)]
        "{user_prompt}"
        """

        print(f"📡 Requesting to {self.provider}...")

        try:
            response_text = ""
            
            if self.provider == "gemini":
                if not self.gemini_key:
                    return {"type": "chat", "message": "❌ .env 파일에 GEMINI_API_KEY가 없습니다."}
                    
                genai.configure(api_key=self.gemini_key)
                
                # ✅ gemini-1.5-flash 사용 (무료 쿼터 1500회/일, 긴 컨텍스트 지원)
                model = genai.GenerativeModel(
                    model_name='gemini-2.5-flash',
                    generation_config={"response_mime_type": "application/json"}
                )
                response = model.generate_content(system_instruction + "\n" + user_message)
                response_text = response.text

            elif self.provider == "groq":
                if not self.groq_key:
                    return {"type": "chat", "message": "❌ .env 파일에 GROQ_API_KEY가 없습니다."}

                client = Groq(api_key=self.groq_key)
                completion = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": user_message}
                    ],
                    response_format={"type": "json_object"}, 
                    temperature=0.0
                )
                response_text = completion.choices[0].message.content

            print(f"🤖 Raw AI Response: [{response_text}]") 

            # 응답 검증 및 파싱
            if not response_text or not response_text.strip():
                return {"type": "chat", "message": "❌ AI 응답이 비어있습니다."}

            clean_text = re.sub(r"```json|```", "", response_text).strip()
            
            try:
                return json.loads(clean_text)
            except json.JSONDecodeError:
                match = re.search(r'\{.*\}', clean_text, re.DOTALL)
                if match:
                    return json.loads(match.group(0))
                else:
                    return {"type": "chat", "message": f"❌ JSON 파싱 실패: {clean_text[:30]}..."}

        except Exception as e:
            print(f"🔥 Critical Error: {e}")
            return {"type": "chat", "message": f"시스템 에러: {str(e)}"}

# 싱글톤 인스턴스 생성 (다른 파일에서 AiAgent.GetCoordinates() 로 사용)
AiAgent = aiService()