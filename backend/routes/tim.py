"""
TIM (Transportation Intelligence Module) — Backend proxy for Groq LLM calls.
Keeps the API key server-side instead of exposing it to the frontend.
"""
import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/api/tim", tags=["tim"])

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


class ChatMessage(BaseModel):
    role: str
    content: str


class TimChatRequest(BaseModel):
    messages: List[ChatMessage]
    max_tokens: Optional[int] = 220
    temperature: Optional[float] = 0.75
    stream: Optional[bool] = False


@router.post("/chat")
async def tim_chat(req: TimChatRequest):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=503, detail="GROQ_API_KEY not configured")

    import httpx
    async with httpx.AsyncClient(timeout=30) as client:
        payload = {
            "model": GROQ_MODEL,
            "messages": [{"role": m.role, "content": m.content} for m in req.messages],
            "max_tokens": req.max_tokens,
            "temperature": req.temperature,
            "stream": False,
        }
        resp = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"content": content}
