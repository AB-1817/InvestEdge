import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os

router = APIRouter(prefix="/api", tags=["Chat Proxy"])

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


class ChatMessage(BaseModel):
    role: str
    content: Optional[str] = ""
    name: Optional[str] = None
    tool_call_id: Optional[str] = None
    tool_calls: Optional[List[Dict[str, Any]]] = None


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]] = Field(..., description="Conversation message history")
    tools: Optional[List[Dict[str, Any]]] = Field(default=None, description="Tool definitions")
    model: str = Field(default="llama-3.3-70b-versatile", description="Groq LLM model")
    max_tokens: int = Field(default=1500, description="Max response tokens")
    temperature: float = Field(default=0.3, description="Temperature sampling")
    tool_choice: Optional[Any] = Field(default="auto", description="Tool choice mode")


def get_server_groq_key() -> str:
    """Retrieve active server-side Groq key without exposing it to clients."""
    keys = [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")]
    valid_keys = [k for k in keys if k and k.strip()]
    if not valid_keys:
        raise HTTPException(
            status_code=503,
            detail="Groq API key is not configured on the backend server."
        )
    return valid_keys[0]


@router.post("/chat")
async def chat_proxy(req: ChatRequest):
    """
    Server-side LLM proxy endpoint for Market Brain ChatUI.
    Proxies browser requests to Groq Cloud API using backend GROQ_API_KEY.
    Enforces payload bounds (max 30 messages, max 4000 chars/message, max 10 tools).
    """
    if len(req.messages) > 30:
        raise HTTPException(status_code=400, detail="Conversation history exceeds maximum limit of 30 messages.")

    for m in req.messages:
        content = m.get("content")
        if isinstance(content, str) and len(content) > 4000:
            raise HTTPException(status_code=400, detail="Message content exceeds maximum limit of 4000 characters.")

    if req.tools and len(req.tools) > 10:
        raise HTTPException(status_code=400, detail="Tools definition count exceeds maximum limit of 10 tools.")

    groq_key = get_server_groq_key()

    payload = {
        "model": req.model,
        "messages": req.messages,
        "max_tokens": req.max_tokens,
        "temperature": req.temperature,
    }

    if req.tools:
        payload["tools"] = req.tools
        payload["tool_choice"] = req.tool_choice

    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(GROQ_API_URL, headers=headers, json=payload)
            if not res.ok:
                err_data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
                safe_msg = err_data.get("error", {}).get("message", f"Upstream Groq API returned status {res.status_code}")
                raise HTTPException(status_code=502, detail=f"LLM Service Error: {safe_msg}")
            
            return res.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="LLM Service request timed out.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal error communicating with LLM Service.")
