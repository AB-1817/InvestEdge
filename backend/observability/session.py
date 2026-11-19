"""
Session State Management for InvestEdge LLM Conversations.

Maintains per-session conversation history with strict boundaries:
- Bounded turn count (max_history_turns)
- Token budget enforcement (max_tokens_budget)
- Rolling window truncation and context condensation to prevent unbounded context growth.
"""
from typing import Dict, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, Field


def estimate_tokens(text: str) -> int:
    """Fast, reliable token estimation heuristic (~4 chars/token for English/financial text)."""
    if not text:
        return 0
    return max(1, len(text.strip()) // 4)


class SessionMessage(BaseModel):
    role: str = Field(..., description="'user', 'assistant', or 'system'")
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    estimated_tokens: int = 0

    def model_post_init(self, __context: Any) -> None:
        if self.estimated_tokens <= 0:
            self.estimated_tokens = estimate_tokens(self.content)


class ConversationSession:
    """Manages an individual conversation session's message buffer."""
    def __init__(
        self,
        session_id: str,
        max_history_turns: int = 10,
        max_tokens_budget: int = 3000,
        system_prompt: Optional[str] = None
    ):
        self.session_id = session_id
        self.max_history_turns = max_history_turns
        self.max_tokens_budget = max_tokens_budget
        self.system_prompt = system_prompt
        self.messages: List[SessionMessage] = []
        self.context_summary: Optional[str] = None
        self.updated_at = datetime.utcnow().isoformat()

    def add_message(self, role: str, content: str) -> SessionMessage:
        msg = SessionMessage(role=role, content=content)
        self.messages.append(msg)
        self.updated_at = datetime.utcnow().isoformat()
        self._enforce_bounds()
        return msg

    def _calculate_total_tokens(self) -> int:
        sys_tokens = estimate_tokens(self.system_prompt) if self.system_prompt else 0
        summary_tokens = estimate_tokens(self.context_summary) if self.context_summary else 0
        msg_tokens = sum(m.estimated_tokens for m in self.messages)
        return sys_tokens + summary_tokens + msg_tokens

    def _enforce_bounds(self):
        """
        Truncates or summarizes older turns when message count or token budget is exceeded.
        Guarantees that history remains strictly bounded.
        """
        # 1. Bounded turn check (1 turn = 1 user + 1 assistant = 2 messages)
        max_messages = self.max_history_turns * 2
        if len(self.messages) > max_messages:
            overflow_count = len(self.messages) - max_messages
            evicted = self.messages[:overflow_count]
            self.messages = self.messages[overflow_count:]
            # Condense evicted history into summary note
            topics = [f"{m.role}: {m.content[:60]}..." for m in evicted if m.role == "user"]
            if topics:
                condensed = f"Earlier discussed topics: {'; '.join(topics)}"
                self.context_summary = (
                    f"{self.context_summary} | {condensed}" if self.context_summary else condensed
                )

        # 2. Token budget check
        while self.messages and self._calculate_total_tokens() > self.max_tokens_budget:
            # Drop oldest message until budget fits
            evicted = self.messages.pop(0)
            if evicted.role == "user" and not self.context_summary:
                self.context_summary = f"Earlier query: {evicted.content[:80]}..."

    def get_messages_for_llm(self) -> List[Dict[str, str]]:
        """
        Produces formatted messages for LLM completion:
        [system] -> [optional context summary] -> [recent bounded conversation turns]
        """
        out: List[Dict[str, str]] = []
        if self.system_prompt:
            out.append({"role": "system", "content": self.system_prompt})

        if self.context_summary:
            out.append({
                "role": "system",
                "content": f"[Context from prior messages in this session: {self.context_summary}]"
            })

        for m in self.messages:
            out.append({"role": m.role, "content": m.content})

        return out

    def clear(self):
        self.messages.clear()
        self.context_summary = None
        self.updated_at = datetime.utcnow().isoformat()


class SessionStateManager:
    """Thread-safe multi-session manager."""
    def __init__(self, default_max_turns: int = 10, default_token_budget: int = 3000):
        self._sessions: Dict[str, ConversationSession] = {}
        self.default_max_turns = default_max_turns
        self.default_token_budget = default_token_budget

    def get_or_create_session(
        self,
        session_id: str,
        system_prompt: Optional[str] = None
    ) -> ConversationSession:
        if session_id not in self._sessions:
            self._sessions[session_id] = ConversationSession(
                session_id=session_id,
                max_history_turns=self.default_max_turns,
                max_tokens_budget=self.default_token_budget,
                system_prompt=system_prompt
            )
        return self._sessions[session_id]

    def add_turn(self, session_id: str, user_content: str, assistant_content: str):
        session = self.get_or_create_session(session_id)
        session.add_message("user", user_content)
        session.add_message("assistant", assistant_content)

    def get_history(self, session_id: str) -> List[Dict[str, str]]:
        session = self.get_or_create_session(session_id)
        return session.get_messages_for_llm()

    def clear(self, session_id: str):
        if session_id in self._sessions:
            self._sessions[session_id].clear()


# Global singleton
_SESSION_MANAGER = SessionStateManager()


def get_session_manager() -> SessionStateManager:
    return _SESSION_MANAGER

