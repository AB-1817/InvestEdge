import time
import asyncio
from typing import Dict, List, Tuple, Optional
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


# Endpoint Rate Limit Configurations (Window = 60s)
# Format: path_prefix -> (max_requests_per_minute, tier_name)
RATE_LIMIT_TIERS = {
    "/api/chat": (10, "very_high"),
    "/api/radar": (5, "very_high_radar"),
    "/api/backtest/run": (10, "very_high_backtest"),
    "/api/news/synthesize": (10, "very_high"),
    "/api/video/generate": (5, "very_high_video"),
    "/api/portfolio/doctor": (15, "medium"),
    "/api/patterns": (30, "medium"),
    "/api/opportunity": (30, "medium"),
    "/api/portfolio": (30, "medium"),
    "/api/earnings/predict": (30, "medium"),
    "/api/market/regime": (60, "low"),
    "/api/backtest/strategies": (60, "low"),
    "/api/backtest/signal-evidence": (30, "low"),
}

DEFAULT_LIMIT = (60, "default_low")

# Maximum Concurrency Semaphores for heavy scraping/backtests
HEAVY_SEMAPHORES = {
    "/api/radar": asyncio.Semaphore(3),
    "/api/backtest/run": asyncio.Semaphore(5),
    "/api/video/generate": asyncio.Semaphore(2),
}


class SlidingWindowRateLimiter:
    def __init__(self):
        # Storage: (client_ip, tier) -> List[timestamps]
        self._requests: Dict[Tuple[str, str], List[float]] = {}
        self._lock = asyncio.Lock()

    async def check_rate_limit(self, client_ip: str, path: str) -> Tuple[bool, int, str]:
        # Match longest matching prefix
        max_req = DEFAULT_LIMIT[0]
        tier = DEFAULT_LIMIT[1]
        for prefix, config in RATE_LIMIT_TIERS.items():
            if path.startswith(prefix):
                max_req, tier = config
                break

        now = time.time()
        window = 60.0  # 1 minute sliding window

        async with self._lock:
            key = (client_ip, tier)
            timestamps = self._requests.get(key, [])
            valid_timestamps = [t for t in timestamps if now - t < window]

            if len(valid_timestamps) >= max_req:
                oldest = valid_timestamps[0]
                retry_after = int(window - (now - oldest)) + 1
                self._requests[key] = valid_timestamps
                return True, max(1, retry_after), tier

            valid_timestamps.append(now)
            self._requests[key] = valid_timestamps
            return False, 0, tier


limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract client IP safely from request or proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in chain
        parts = [p.strip() for p in forwarded.split(",")]
        if parts:
            return parts[0]
    return request.client.host if request.client else "127.0.0.1"


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Ignore static assets, docs, health check
        if path in ["/", "/health", "/docs", "/openapi.json"] or path.startswith("/assets"):
            return await call_next(request)

        client_ip = get_client_ip(request)
        is_limited, retry_after, tier = await limiter.check_rate_limit(client_ip, path)

        if is_limited:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded. Too many requests. Please wait before retrying.",
                    "tier": tier,
                    "retry_after_seconds": retry_after
                },
                headers={"Retry-After": str(retry_after)}
            )

        # Check Concurrency Limit for Heavy Routes
        sem = None
        for prefix, s in HEAVY_SEMAPHORES.items():
            if path.startswith(prefix):
                sem = s
                break

        if sem:
            try:
                # Non-blocking acquire check or bounded timeout
                async with sem:
                    return await call_next(request)
            except asyncio.TimeoutError:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Server busy. Concurrency limit reached for heavy compute route."},
                    headers={"Retry-After": "5"}
                )

        return await call_next(request)
