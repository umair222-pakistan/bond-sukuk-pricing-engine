import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from backend.main import app

__all__ = ["app"]
