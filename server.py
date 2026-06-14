"""
Compatibility entry point.

Allows running `uvicorn server:app` from the repository root while the real
application lives in `backend/server.py`.
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
BACKEND_ENTRY = BACKEND_DIR / "server.py"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

spec = spec_from_file_location("backend_entry", BACKEND_ENTRY)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Cannot load backend entrypoint: {BACKEND_ENTRY}")

backend_entry = module_from_spec(spec)
spec.loader.exec_module(backend_entry)

app = backend_entry.app
