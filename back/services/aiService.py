from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from typing import Any, Literal

import google.generativeai as genai
from groq import Groq
from pydantic import BaseModel, Field, ValidationError


class AIAction(BaseModel):
    action: Literal["click"] = "click"
    x: int = Field(ge=0)
    y: int = Field(ge=0)


class AIAdapterError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code


class BaseAIAdapter(ABC):
    def __init__(self, api_key: str, model: str | None = None):
        if not api_key:
            raise AIAdapterError("AI API key is missing.", status_code=401)
        self.api_key = api_key
        self.model = model

    @abstractmethod
    def generate_action(self, user_prompt: str, ui_elements: list[dict[str, Any]]) -> AIAction:
        raise NotImplementedError

    def _build_messages(self, user_prompt: str, ui_elements: list[dict[str, Any]]) -> tuple[str, str]:
        system_instruction = """
You are an Android UI automation planner.
Return only JSON matching this exact schema:
{"action":"click","x":100,"y":200}
Choose the most likely coordinate for the user's command from the screen elements.
"""
        user_message = json.dumps(
            {
                "screen_elements": ui_elements,
                "user_command": user_prompt,
            },
            ensure_ascii=False,
        )
        return system_instruction, user_message

    def _normalize(self, response_text: str) -> AIAction:
        clean_text = re.sub(r"```json|```", "", response_text or "").strip()
        try:
            payload = json.loads(clean_text)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", clean_text, re.DOTALL)
            if not match:
                raise AIAdapterError("AI response is not valid JSON.")
            payload = json.loads(match.group(0))

        if "type" in payload and payload.get("type") == "action":
            payload = {"action": "click", "x": payload.get("x"), "y": payload.get("y")}

        try:
            if hasattr(AIAction, "model_validate"):
                return AIAction.model_validate(payload)
            return AIAction.parse_obj(payload)
        except ValidationError as exc:
            raise AIAdapterError(f"AI response schema mismatch: {exc}") from exc


class GeminiAdapter(BaseAIAdapter):
    def generate_action(self, user_prompt: str, ui_elements: list[dict[str, Any]]) -> AIAction:
        system_instruction, user_message = self._build_messages(user_prompt, ui_elements)
        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel(
                model_name=self.model or "gemini-2.5-flash",
                generation_config={"response_mime_type": "application/json"},
            )
            response = model.generate_content(f"{system_instruction}\n{user_message}")
            return self._normalize(response.text)
        except Exception as exc:
            status_code = 429 if "429" in str(exc) else 401 if "401" in str(exc) else 500
            raise AIAdapterError(str(exc), status_code=status_code) from exc


class GroqAdapter(BaseAIAdapter):
    def generate_action(self, user_prompt: str, ui_elements: list[dict[str, Any]]) -> AIAction:
        system_instruction, user_message = self._build_messages(user_prompt, ui_elements)
        try:
            client = Groq(api_key=self.api_key)
            completion = client.chat.completions.create(
                model=self.model or "llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_message},
                ],
                response_format={"type": "json_object"},
                temperature=0.0,
            )
            return self._normalize(completion.choices[0].message.content or "")
        except Exception as exc:
            status_code = 429 if "429" in str(exc) else 401 if "401" in str(exc) else 500
            raise AIAdapterError(str(exc), status_code=status_code) from exc


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        return ""
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def get_adapter(provider: str, token: str) -> BaseAIAdapter:
    normalized = (provider or "gemini").lower()
    if normalized == "groq":
        return GroqAdapter(token)
    return GeminiAdapter(token)


def call_with_fallback(
    *,
    primary_provider: str,
    primary_token: str,
    fallback_token: str | None,
    user_prompt: str,
    ui_elements: list[dict[str, Any]],
) -> AIAction:
    providers = [primary_provider or "gemini"]
    fallback_provider = "groq" if providers[0].lower() != "groq" else "gemini"
    providers.append(fallback_provider)

    last_error: Exception | None = None
    for provider in providers:
        token = primary_token if provider == providers[0] else (fallback_token or primary_token)
        try:
            return get_adapter(provider, token).generate_action(user_prompt, ui_elements)
        except Exception as exc:
            last_error = exc
            continue

    raise AIAdapterError("모든 AI Provider 응답 실패. 한도를 확인하세요.") from last_error


class aiService:
    def GetCoordinates(self, user_prompt, ui_elements, token: str = "", provider: str = "gemini", fallback_token: str | None = None):
        action = call_with_fallback(
            primary_provider=provider,
            primary_token=token,
            fallback_token=fallback_token or token,
            user_prompt=user_prompt,
            ui_elements=ui_elements,
        )
        return {"type": "action", "x": action.x, "y": action.y, "summary": "AI click"}


AiAgent = aiService()
