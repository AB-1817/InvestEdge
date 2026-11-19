"""
LLM Pricing Table & Cost Estimator for InvestEdge.

Maintains price rates per 1,000,000 tokens for supported providers (Groq, Google Gemini)
and calculates USD cost for prompt and completion token counts.
"""
from typing import Dict, Any, Tuple


# Pricing per 1,000,000 tokens in USD (input, output)
MODEL_PRICING_TABLE: Dict[str, Tuple[float, float]] = {
    # Groq LLaMA models
    "llama-3.3-70b-versatile": (0.59, 0.79),
    "llama3-70b-8192": (0.59, 0.79),
    "llama3-8b-8192": (0.05, 0.08),
    "mixtral-8x7b-32768": (0.24, 0.24),
    "gemma2-9b-it": (0.20, 0.20),

    # Google Gemini models
    "gemini-2.0-flash": (0.075, 0.30),
    "gemini-2.0-flash-exp": (0.075, 0.30),
    "gemini-2.5-flash": (0.075, 0.30),
    "gemini-1.5-flash": (0.075, 0.30),
    "gemini-1.5-pro": (1.25, 5.00),
    "gemini-2.0-pro": (1.25, 5.00),

    # Default / Mock / Offline
    "mock": (0.0, 0.0),
    "deterministic": (0.0, 0.0),
}

DEFAULT_FALLBACK_RATE = (0.50, 0.80)  # Standard fallback rate if model is unlisted


def calculate_llm_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """
    Computes estimated USD cost based on token counts and model price card.
    Formula: (prompt_tokens * input_rate_per_m + completion_tokens * output_rate_per_m) / 1,000,000
    """
    normalized_model = model.lower().strip()
    # Direct match or partial prefix match
    rate = MODEL_PRICING_TABLE.get(normalized_model)
    if not rate:
        for k, v in MODEL_PRICING_TABLE.items():
            if k in normalized_model or normalized_model in k:
                rate = v
                break

    if not rate:
        rate = DEFAULT_FALLBACK_RATE

    input_cost = (prompt_tokens * rate[0]) / 1_000_000.0
    output_cost = (completion_tokens * rate[1]) / 1_000_000.0
    return round(input_cost + output_cost, 6)
