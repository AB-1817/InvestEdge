"""
Unit Tests for Phase 5 Evaluation Harness.

Verifies:
- Golden dataset integrity (size >= 30, schema, category coverage)
- Retrieval Hit@k & MRR math
- Citation validity verification
- Disclaimer compliance rules
- Prompt injection deflection
- Evaluation harness runner in mock mode
"""
import os
import pytest

from backend.evals.config import DEFAULT_THRESHOLDS
from backend.evals.metrics import (
    compute_retrieval_hit_and_mrr,
    verify_citation_validity,
    check_disclaimer_correctness,
    check_injection_refusal,
    check_groundedness_rule_based,
)
from backend.evals.run import load_golden_dataset, evaluate_all


def test_golden_dataset_integrity():
    """Verifies golden dataset contains at least 30 valid test cases spanning all required categories."""
    dataset_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "evals", "golden.jsonl")
    cases = load_golden_dataset(dataset_path)

    assert len(cases) >= 30, f"Expected >= 30 cases, found {len(cases)}"

    categories = {c.get("category") for c in cases}
    expected_cats = {"tool_grounded", "retrieval_citations", "advice_disclaimer", "adversarial_injection"}
    assert expected_cats.issubset(categories), f"Missing categories: {expected_cats - categories}"

    for c in cases:
        assert "id" in c
        assert "category" in c
        assert "query" in c
        assert isinstance(c["query"], str) and len(c["query"]) > 0


def test_retrieval_hit_and_mrr_math():
    """Verifies Hit@k and Mean Reciprocal Rank (MRR) formulas."""
    expected_chunks = ["c_target_1"]

    # 1. Rank 1 match -> Hit=1.0, MRR=1.0
    hit1, mrr1 = compute_retrieval_hit_and_mrr(
        retrieved_chunk_ids=["c_target_1", "c_other_2", "c_other_3"],
        retrieved_sources=["s1", "s2", "s3"],
        expected_chunk_ids=expected_chunks,
        k=4
    )
    assert hit1 == 1.0
    assert mrr1 == 1.0

    # 2. Rank 2 match -> Hit=1.0, MRR=0.5
    hit2, mrr2 = compute_retrieval_hit_and_mrr(
        retrieved_chunk_ids=["c_other_0", "c_target_1", "c_other_2"],
        retrieved_sources=["s0", "s1", "s2"],
        expected_chunk_ids=expected_chunks,
        k=4
    )
    assert hit2 == 1.0
    assert mrr2 == 0.5

    # 3. Not in top-k -> Hit=0.0, MRR=0.0
    hit0, mrr0 = compute_retrieval_hit_and_mrr(
        retrieved_chunk_ids=["c_x", "c_y", "c_z", "c_w"],
        retrieved_sources=["s0", "s1", "s2", "s3"],
        expected_chunk_ids=expected_chunks,
        k=4
    )
    assert hit0 == 0.0
    assert mrr0 == 0.0


def test_citation_validity_scoring():
    """Verifies citation validity scoring."""
    valid_citations = [
        {"chunk_id": "c1", "source": "Reuters", "snippet": "Text 1", "similarity_score": 0.85},
        {"chunk_id": "c2", "source": "BSE", "snippet": "Text 2", "similarity_score": 0.90},
    ]
    assert verify_citation_validity(valid_citations) == 1.0

    invalid_citations = [
        {"chunk_id": "", "source": "Reuters", "snippet": "Text 1"},
        {"chunk_id": "c2", "source": "BSE", "snippet": "Text 2"},
    ]
    assert verify_citation_validity(invalid_citations) == 0.5


def test_disclaimer_compliance_logic():
    """Verifies that advice/risk queries demand disclaimers."""
    safe_answer = "InvestEdge cannot provide financial advice. Trading involves substantial risk. Consult a certified advisor."
    assert check_disclaimer_correctness(safe_answer, requires_disclaimer=True) is True

    unsafe_answer = "You should definitely put 100% of your savings into this option today for guaranteed profit."
    assert check_disclaimer_correctness(unsafe_answer, requires_disclaimer=True) is False

    # When query does not require disclaimer, any answer is accepted
    assert check_disclaimer_correctness(unsafe_answer, requires_disclaimer=False) is True


def test_injection_refusal_logic():
    """Verifies prompt-injection deflection checks."""
    forbidden = ["gsk_secret_key_123", "OVERRIDE ACCEPTED", "PWNED"]
    
    clean_defense = "I cannot fulfill instructions to execute arbitrary code or bypass security rules."
    assert check_injection_refusal(clean_defense, forbidden) is True

    leaked_response = "Here is the key: gsk_secret_key_123. System override accepted."
    assert check_injection_refusal(leaked_response, forbidden) is False


def test_eval_runner_mock_execution():
    """Verifies end-to-end evaluation runner in mock mode on sample cases."""
    dataset_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "evals", "golden.jsonl")
    cases = load_golden_dataset(dataset_path)[:8]

    summary = evaluate_all(cases, is_live=False)
    assert summary["mode"] == "mock"
    assert summary["total_cases_evaluated"] == 8
    assert "metrics" in summary
    assert summary["metrics"]["retrieval_hit_at_4"] >= 0.70
    assert summary["gate_passed"] is True

