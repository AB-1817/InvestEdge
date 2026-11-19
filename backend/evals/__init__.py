"""
InvestEdge Evaluation Harness Subsystem (Phase 5).
"""
try:
    from backend.evals.config import DEFAULT_THRESHOLDS, EvalGateThresholds
    from backend.evals.metrics import (
        compute_retrieval_hit_and_mrr,
        verify_citation_validity,
        check_disclaimer_correctness,
        check_injection_refusal,
        check_groundedness_rule_based,
    )
except ImportError:
    from evals.config import DEFAULT_THRESHOLDS, EvalGateThresholds
    from evals.metrics import (
        compute_retrieval_hit_and_mrr,
        verify_citation_validity,
        check_disclaimer_correctness,
        check_injection_refusal,
        check_groundedness_rule_based,
    )

__all__ = [
    "DEFAULT_THRESHOLDS",
    "EvalGateThresholds",
    "compute_retrieval_hit_and_mrr",
    "verify_citation_validity",
    "check_disclaimer_correctness",
    "check_injection_refusal",
    "check_groundedness_rule_based",
]
