import os
import sqlite3
import json
from datetime import datetime
from typing import List, Optional, Dict, Any

from models_ledger import SignalRecordSchema, SignalOutcomeSchema

DB_PATH = os.getenv("INVESTEDGE_DB_PATH", os.path.join(os.path.dirname(__file__), "investedge.db"))


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes relational database schema with strict uniqueness constraints and indexes."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Signals Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            signal_id TEXT PRIMARY KEY,
            symbol TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            strategy_name TEXT NOT NULL,
            signal_direction TEXT NOT NULL DEFAULT 'BUY',
            signal_timestamp TEXT NOT NULL,
            signal_price REAL NOT NULL,
            market_regime TEXT NOT NULL,
            confidence REAL,
            source_data_snapshot TEXT NOT NULL,
            engine_version TEXT NOT NULL DEFAULT 'v1.0.0-investedge',
            created_at TEXT NOT NULL,
            UNIQUE(symbol, signal_type, strategy_name, signal_timestamp)
        );
        """)

        # Outcomes Table (1D, 5D, 15D horizons per signal)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS signal_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id TEXT NOT NULL,
            horizon_days INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'PENDING',
            evaluation_date TEXT,
            outcome_price REAL,
            return_pct REAL,
            benchmark_return_pct REAL,
            alpha_pct REAL,
            result TEXT,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (signal_id) REFERENCES signals (signal_id) ON DELETE CASCADE,
            UNIQUE(signal_id, horizon_days)
        );
        """)

        # Indexes for fast lookup & filtering
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals (symbol);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_signals_type ON signals (signal_type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_outcomes_status ON signal_outcomes (status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_outcomes_horizon ON signal_outcomes (horizon_days);")
        
        conn.commit()


# Initialize database schema on module load
init_db()


class SignalLedgerRepository:
    """
    Relational Database Access Layer for InvestEdge Signal Track Record.
    Implements deterministic idempotency, immutable signal snapshots, and multi-horizon outcome tracking.
    """
    @staticmethod
    def save_signal(record: SignalRecordSchema) -> bool:
        """
        Saves a newly generated signal and initializes 1D, 5D, 15D PENDING outcomes.
        Idempotent: Ignores duplicate insertions based on (symbol, signal_type, strategy_name, signal_timestamp).
        """
        snapshot_json = json.dumps(record.source_data_snapshot)
        with get_db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("""
                INSERT INTO signals (
                    signal_id, symbol, signal_type, strategy_name, signal_direction,
                    signal_timestamp, signal_price, market_regime, confidence,
                    source_data_snapshot, engine_version, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    record.signal_id, record.symbol.upper(), record.signal_type, record.strategy_name,
                    record.signal_direction, record.signal_timestamp, record.signal_price,
                    record.market_regime, record.confidence, snapshot_json,
                    record.engine_version, record.created_at
                ))

                # Initialize 1D, 5D, 15D outcomes as PENDING
                now_str = datetime.now().isoformat()
                for h in [1, 5, 15]:
                    cursor.execute("""
                    INSERT INTO signal_outcomes (signal_id, horizon_days, status, updated_at)
                    VALUES (?, ?, 'PENDING', ?);
                    """, (record.signal_id, h, now_str))

                conn.commit()
                return True
            except sqlite3.IntegrityError:
                # Duplicate signal ignored safely
                return False

    @staticmethod
    def get_pending_outcomes() -> List[Dict[str, Any]]:
        """Returns all PENDING signal outcomes with parent signal details for evaluation."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT o.id as outcome_id, o.horizon_days, s.signal_id, s.symbol, s.signal_direction,
                   s.signal_timestamp, s.signal_price, s.market_regime, s.engine_version
            FROM signal_outcomes o
            JOIN signals s ON o.signal_id = s.signal_id
            WHERE o.status = 'PENDING';
            """)
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def update_outcome(
        outcome_id: int,
        evaluation_date: str,
        outcome_price: float,
        return_pct: float,
        benchmark_return_pct: float,
        alpha_pct: float,
        result: str
    ) -> bool:
        """Updates a signal outcome from PENDING to RESOLVED (Immutable once resolved)."""
        now_str = datetime.now().isoformat()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
            UPDATE signal_outcomes
            SET status = 'RESOLVED',
                evaluation_date = ?,
                outcome_price = ?,
                return_pct = ?,
                benchmark_return_pct = ?,
                alpha_pct = ?,
                result = ?,
                updated_at = ?
            WHERE id = ? AND status = 'PENDING';
            """, (evaluation_date, outcome_price, return_pct, benchmark_return_pct, alpha_pct, result, now_str, outcome_id))
            conn.commit()
            return cursor.rowcount > 0

    @staticmethod
    def list_signals(
        symbol: Optional[str] = None,
        signal_type: Optional[str] = None,
        result: Optional[str] = None,
        horizon_days: int = 15,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Queries signals and outcomes for a specific horizon with filtering."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            query = """
            SELECT s.signal_id, s.symbol, s.signal_type, s.strategy_name, s.signal_direction,
                   s.signal_timestamp, s.signal_price, s.market_regime, s.confidence,
                   s.source_data_snapshot, s.engine_version, s.created_at,
                   o.horizon_days, o.status, o.evaluation_date, o.outcome_price,
                   o.return_pct, o.benchmark_return_pct, o.alpha_pct, o.result
            FROM signals s
            JOIN signal_outcomes o ON s.signal_id = o.signal_id
            WHERE o.horizon_days = ?
            """
            params = [horizon_days]

            if symbol:
                query += " AND s.symbol = ?"
                params.append(symbol.upper())
            if signal_type:
                query += " AND s.signal_type = ?"
                params.append(signal_type)
            if result:
                query += " AND o.result = ?"
                params.append(result)

            query += " ORDER BY s.signal_timestamp DESC LIMIT ?"
            params.append(limit)

            cursor.execute(query, params)
            rows = cursor.fetchall()
            results = []
            for r in rows:
                d = dict(r)
                try:
                    d["source_data_snapshot"] = json.loads(d["source_data_snapshot"])
                except Exception:
                    d["source_data_snapshot"] = {}
                results.append(d)
            return results

    @staticmethod
    def get_signal_detail(signal_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves full signal record snapshot and all 1D, 5D, 15D outcomes for audit trail."""
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM signals WHERE signal_id = ?;", (signal_id,))
            s_row = cursor.fetchone()
            if not s_row:
                return None

            signal_dict = dict(s_row)
            try:
                signal_dict["source_data_snapshot"] = json.loads(signal_dict["source_data_snapshot"])
            except Exception:
                signal_dict["source_data_snapshot"] = {}

            cursor.execute("SELECT * FROM signal_outcomes WHERE signal_id = ? ORDER BY horizon_days ASC;", (signal_id,))
            o_rows = cursor.fetchall()
            signal_dict["outcomes"] = [dict(r) for r in o_rows]
            return signal_dict
