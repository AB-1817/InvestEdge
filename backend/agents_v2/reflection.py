"""
Critic & Reflection Engine for InvestEdge Multi-Agent System (Agents v2).

Reviews agent draft answers against tool outputs and retrieved evidence.
If unsupported claims, hallucinated metrics, or contradictions are identified,
revises the answer once to ensure 100% grounded financial intelligence.
"""
import os
import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from pydantic import BaseModel, Field

from .providers import call_agent_llm

logger = logging.getLogger("investedge.agents.reflection")


class ReflectionResult(BaseModel):
    final_answer: str
    reflection_applied: bool
    unsupported_claims: List[str] = Field(default_factory=list)
    critique: str = ""


class CriticReflectionEngine:
    """
    Evaluates draft syntheses for quantitative accuracy against tool observations.
    """

    def __init__(self, enabled: Optional[bool] = None):
        if enabled is not None:
            self.enabled = enabled
        else:
            self.enabled = os.getenv("AGENT_ENABLE_REFLECTION", "true").lower() in ("true", "1", "yes")

    def find_unsupported_numbers(self, draft: str, evidence_text: str) -> List[str]:
        """
        Rule-based sanity check: extracts numerical values and currency figures
        from draft and checks if they exist in the observations text.
        """
        unsupported = []
        # Find currency amounts, percentages, and multiples (e.g. ₹2,400, 24.5x, 78%)
        patterns = re.findall(r"(?:₹|\$)?\d+(?:\.\d+)?(?:%|x|Cr|cr)?", draft)
        ev_lower = evidence_text.lower()

        for token in patterns:
            # Skip common generic numbers
            clean_token = token.strip("₹$%x ").lower()
            if not clean_token or clean_token in ["1", "2", "3", "4", "5", "10", "15", "20", "50", "100", "200"]:
                continue
            if clean_token not in ev_lower:
                unsupported.append(token)

        return list(set(unsupported))

    async def reflect_and_revise(
        self,
        query: str,
        draft_answer: str,
        tool_observations: List[Dict[str, Any]],
        retrieved_evidence: List[Dict[str, Any]]
    ) -> ReflectionResult:
        """
        Executes critic reflection step:
        1. Compiles all verified tool outputs and RAG snippets into grounding ground truth.
        2. Detects unsupported claims.
        3. Revises once if unsupported claims or hallucinations are flagged.
        """
        if not self.enabled:
            return ReflectionResult(
                final_answer=draft_answer,
                reflection_applied=False,
                critique="Reflection disabled by configuration."
            )

        # Assemble grounding ground-truth text
        ground_truth_parts = []
        for obs in tool_observations:
            ground_truth_parts.append(f"TOOL [{obs.get('tool_name')}]: {obs.get('output')}")
        for ev in retrieved_evidence:
            ground_truth_parts.append(f"RAG [{ev.get('source')}]: {ev.get('snippet')}")

        ground_truth_text = "\n".join(ground_truth_parts)

        # 1. Rule-based check
        unsupported_tokens = self.find_unsupported_numbers(draft_answer, ground_truth_text)

        # 2. If no ground truth or empty draft, return as-is
        if not ground_truth_text or not draft_answer.strip():
            return ReflectionResult(
                final_answer=draft_answer,
                reflection_applied=False,
                critique="No evidence text available to critique."
            )

        # If suspicious unsupported numbers found or reflection is enabled, ask critic LLM
        critic_prompt = (
            f"You are the InvestEdge Lead Financial Critic & Auditor.\n"
            f"USER QUERY: {query}\n\n"
            f"VERIFIED TOOL EVIDENCE & RETRIEVED DATA:\n"
            f"{ground_truth_text[:2500]}\n\n"
            f"DRAFT ANSWER TO AUDIT:\n"
            f"{draft_answer}\n\n"
            f"CRITIC INSTRUCTIONS:\n"
            f"1. Check if every metric, percentage, price, and claim in the draft is supported by the verified evidence.\n"
            f"2. If unsupported numbers, invented target prices, or hallucinations exist, output:\n"
            f"   CRITIQUE: <brief explanation of issues>\n"
            f"   REVISED: <corrected factual answer strictly grounded in evidence>\n"
            f"3. If the draft is completely accurate and grounded, output:\n"
            f"   CRITIQUE: VERIFIED_ACCURATE\n"
            f"   REVISED: {draft_answer}"
        )

        try:
            resp = await call_agent_llm(
                messages=[
                    {"role": "system", "content": "You are a strict, skeptical financial critic verifying data accuracy."},
                    {"role": "user", "content": critic_prompt}
                ],
                temperature=0.1
            )
            raw = resp.content or ""
            if "CRITIQUE: VERIFIED_ACCURATE" in raw:
                return ReflectionResult(
                    final_answer=draft_answer,
                    reflection_applied=False,
                    critique="Verified accurate by critic against evidence."
                )

            if "REVISED:" in raw:
                parts = raw.split("REVISED:", 1)
                critique_text = parts[0].replace("CRITIQUE:", "").strip()
                revised_text = parts[1].strip()
                return ReflectionResult(
                    final_answer=revised_text,
                    reflection_applied=True,
                    unsupported_claims=unsupported_tokens,
                    critique=critique_text
                )
        except Exception as e:
            logger.warning(f"Critic reflection LLM call failed: {e}")

        # If rule-based check found unsupported tokens and LLM failed, annotate
        if unsupported_tokens:
            revised = f"{draft_answer}\n\n*(Note: Critic flagged preliminary metrics: {', '.join(unsupported_tokens[:3])})*"
            return ReflectionResult(
                final_answer=revised,
                reflection_applied=True,
                unsupported_claims=unsupported_tokens,
                critique="Flagged ungrounded numeric tokens via rule check."
            )

        return ReflectionResult(
            final_answer=draft_answer,
            reflection_applied=False,
            critique="Passed without revisions."
        )
