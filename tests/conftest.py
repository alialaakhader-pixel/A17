import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pytest  # noqa: E402

from wsp import termux_api  # noqa: E402


@pytest.fixture(autouse=True)
def _no_demo_leak():
    termux_api.set_demo(False)
    yield
    termux_api.set_demo(False)


@pytest.fixture
def demo():
    termux_api.set_demo(True)
