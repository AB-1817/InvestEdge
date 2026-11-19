"""
Unified Multi-Model Provider for InvestEdge Agents v2.

Allows running the exact same agent code across:
1. Google Gemini (via google-genai or Vertex AI using GOOGLE_API_KEY)
2. Groq LLaMA 3.3 (via httpx or LiteLLM using GROQ_API_KEY)
3. Mock Provider (for deterministic, offline testing)
"""
import os
import json
import time
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

import httpx

logger = logging.getLogger("investedge.agents.providers")


class LLMToolCall(BaseModel):
    id: str
    name: str
    arguments: Dict[str, Any]


class LLMResponse(BaseModel):
    content: Optional[str] = ""
    tool_calls: List[LLMToolCall] = Field(default_factory=list)
    model: str
    provider: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    latency_ms: float = 0.0


async def call_groq_llm(
    messages: List[Dict[str, Any]],
    model: str = "llama-3.3-70b-versatile",
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: float = 0.2
) -> LLMResponse:
    """Calls Groq Cloud API using backend keys."""
    keys = [os.getenv("GROQ_API_KEY"), os.getenv("GROQ_API_KEY_2")]
    valid_keys = [k for k in keys if k and k.strip()]
    if not valid_keys:
        raise ValueError("GROQ_API_KEY is not configured.")

    key = valid_keys[0]
    payload: Dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 1200,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload)
        latency = round((time.perf_counter() - t0) * 1000, 2)
        if not resp.is_success:
            raise RuntimeError(f"Groq API error ({resp.status_code}): {resp.text}")

        data = resp.json()
        choice = data["choices"][0]["message"]
        usage = data.get("usage", {})

        tool_calls: List[LLMToolCall] = []
        if choice.get("tool_calls"):
            for tc in choice["tool_calls"]:
                try:
                    args = json.loads(tc["function"]["arguments"])
                except Exception:
                    args = {}
                tool_calls.append(LLMToolCall(
                    id=tc["id"],
                    name=tc["function"]["name"],
                    arguments=args
                ))

        return LLMResponse(
            content=choice.get("content") or "",
            tool_calls=tool_calls,
            model=model,
            provider="groq",
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            latency_ms=latency
        )


async def call_gemini_llm(
    messages: List[Dict[str, Any]],
    model: str = "gemini-2.5-flash",
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: float = 0.2
) -> LLMResponse:
    """Calls Google Gemini using google-genai SDK."""
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not configured for Gemini provider.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    # Convert chat messages to Gemini prompt / contents format
    system_text = ""
    contents = []
    for m in messages:
        role = m.get("role", "user")
        text = m.get("content", "")
        if role == "system":
            system_text = text
        elif role == "user":
            contents.append(types.Content(role="user", parts=[types.Part.from_text(text=text)]))
        elif role == "assistant":
            contents.append(types.Content(role="model", parts=[types.Part.from_text(text=text)]))

    config = types.GenerateContentConfig(
        temperature=temperature,
        system_instruction=system_text if system_text else None,
    )

    t0 = time.perf_counter()
    resp = client.models.generate_content(
        model=model,
        contents=contents if contents else [types.Part.from_text(text="Analyze financial data")],
        config=config,
    )
    latency = round((time.perf_counter() - t0) * 1000, 2)

    usage = getattr(resp, "usage_metadata", None)
    prompt_tokens = getattr(usage, "prompt_token_count", 0) if usage else 0
    candidate_tokens = getattr(usage, "candidates_token_count", 0) if usage else 0

    return LLMResponse(
        content=resp.text or "",
        tool_calls=[],
        model=model,
        provider="gemini",
        prompt_tokens=prompt_tokens,
        completion_tokens=candidate_tokens,
        total_tokens=prompt_tokens + candidate_tokens,
        latency_ms=latency
    )


async def call_agent_llm(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    temperature: float = 0.2
) -> LLMResponse:
    """
    Unified entrypoint routing to configured model provider:
    - Checked via AGENT_MODEL_PROVIDER env var ('gemini', 'groq', 'litellm', 'mock').
    - Defaults to 'gemini' if GOOGLE_API_KEY is set, else 'groq'.
    """
    provider = os.getenv("AGENT_MODEL_PROVIDER", "").lower().strip()

    if not provider:
        if os.getenv("GOOGLE_API_KEY"):
            provider = "gemini"
        elif os.getenv("GROQ_API_KEY"):
            provider = "groq"
        else:
            provider = "mock"

    if provider == "gemini":
        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        try:
            return await call_gemini_llm(messages, model=model, tools=tools, temperature=temperature)
        except Exception as e:
            logger.warning(f"Gemini call failed ({e}); attempting Groq fallback...")
            if os.getenv("GROQ_API_KEY"):
                return await call_groq_llm(messages, tools=tools, temperature=temperature)
            raise

    elif provider == "groq":
        model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        return await call_groq_llm(messages, model=model, tools=tools, temperature=temperature)

    elif provider == "litellm":
        try:
            import litellm
            model = os.getenv("LITELLM_MODEL", "groq/llama-3.3-70b-versatile")
            t0 = time.perf_counter()
            res = await litellm.acompletion(model=model, messages=messages, tools=tools, temperature=temperature)
            latency = round((time.perf_counter() - t0) * 1000, 2)
            c = res.choices[0].message
            return LLMResponse(
                content=c.content or "",
                tool_calls=[],
                model=model,
                provider="litellm",
                latency_ms=latency
            )
        except Exception as e:
            logger.warning(f"LiteLLM call failed ({e}), falling back to direct Groq")
            return await call_groq_llm(messages, tools=tools, temperature=temperature)

    # Mock provider for tests & offline runs
    return LLMResponse(
        content="Deterministic analysis generated by mock provider.",
        tool_calls=[],
        model="mock-v1",
        provider="mock",
        prompt_tokens=150,
        completion_tokens=60,
        total_tokens=210,
        latency_ms=5.0
    )

