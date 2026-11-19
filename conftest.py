"""
Root conftest.py — adds backend/ to sys.path so both import styles work:
  - `from backend.main import app`  (used by backend/tests/)
  - `from backtesting.routes import ...` (used by main.py itself)
"""
import sys
import os

# Allow `from backend.X import ...` and bare `from X import ...` to coexist
backend_dir = os.path.join(os.path.dirname(__file__), "backend")
root_dir = os.path.dirname(__file__)

for p in [backend_dir, root_dir]:
    if p not in sys.path:
        sys.path.insert(0, p)
