"""Thin wrapper over Termux:API commands. Raises ApiError with a useful message.

`set_demo(True)` swaps the real calls for synthetic data (see sample_data.py).
"""
import copy
import json

from .env import run

_DEMO = False


class ApiError(Exception):
    pass


def set_demo(flag=True):
    global _DEMO
    _DEMO = bool(flag)


def is_demo():
    return _DEMO


def call_json(cmd, timeout=25):
    rc, out, err = run(cmd, timeout=timeout)
    if rc == 127:
        raise ApiError("Termux:API package missing. Run: pkg install termux-api")
    if rc == 124:
        raise ApiError("Termux:API did not answer. Install/open the Termux:API app "
                       "and grant it permissions.")
    out = out.strip()
    if not out:
        raise ApiError(err.strip() or "Empty response from Termux:API")
    try:
        data = json.loads(out)
    except ValueError:
        raise ApiError(f"Unexpected output: {out[:120]}")
    if isinstance(data, dict) and "API_ERROR" in data:
        raise ApiError(str(data["API_ERROR"]))
    return data


def wifi_scan():
    if _DEMO:
        from .sample_data import DEMO_SCAN
        return copy.deepcopy(DEMO_SCAN)
    return call_json(["termux-wifi-scaninfo"])


def wifi_connection():
    if _DEMO:
        from .sample_data import DEMO_CONNECTION
        return copy.deepcopy(DEMO_CONNECTION)
    return call_json(["termux-wifi-connectioninfo"], timeout=12)
