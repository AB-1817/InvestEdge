from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class SignalOutcomeSchema(BaseModel):
    id: Optional[int] = None
    signal_id: str
    horizon_days: int = Field(..., description="Evaluation horizon: 1, 5, or 15 trading days")
    status: str = Field(default="PENDING", description="PENDING, RESOLVED, or INVALID")
    evaluation_date: Optional[str] = None
    outcome_price: Optional[float] = None
    return_pct: Optional[float] = None
    benchmark_return_pct: Optional[float] = None
    alpha_pct: Optional[float] = None
    result: Optional[str] = None  # SUCCESS, FAILURE, NEUTRAL
    updated_at: Optional[str] = None


class SignalRecordSchema(BaseModel):
    signal_id: str = Field(..., description="Deterministic unique identifier")
    symbol: str
    signal_type: str
    strategy_name: str
    signal_direction: str = Field(default="BUY", description="BUY or SELL")
    signal_timestamp: str
    signal_price: float
    market_regime: str
    confidence: Optional[float] = None
    source_data_snapshot: Dict[str, Any] = Field(default_factory=dict)
    engine_version: str = "v1.0.0-investedge"
    created_at: str
    outcomes: List[SignalOutcomeSchema] = Field(default_factory=list)


class TrackRecordSummary(BaseModel):
    total_signals: int
    resolved_signals: int
    pending_signals: int
    win_rate_pct: float
    avg_return_pct: float
    median_return_pct: float
    avg_alpha_pct: float
    best_return_pct: float
    worst_return_pct: float
    sample_size: int
    horizon_days: int
    statistical_note: str


class EarningsEventStudyItem(BaseModel):
    quarter: str
    earnings_date: str
    pre_10d_return_pct: float
    post_1d_gap_pct: float
    post_5d_return_pct: float
    post_15d_return_pct: float
    event_volatility_pct: float


class EarningsEventStudyResponse(BaseModel):
    symbol: str
    display_name: str
    total_events: int
    avg_post_1d_gap_pct: float
    avg_post_5d_return_pct: float
    avg_post_15d_return_pct: float
    positive_event_pct: float
    event_history: List[EarningsEventStudyItem]
    disclosure: str
    classification: str = "HISTORICAL EARNINGS EVENT STUDY — DATA LIMITED"
