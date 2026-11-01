"""Environment detection: Termux, Termux:API, permissions, optional tools."""
import json
import os
import shutil
import subprocess
import sys

from rich import box
from rich.table import Table
from rich.text import Text

from .ui import console, kv_table


def run(cmd, timeout=15):
    """Run a command (list form, never a shell). Returns (rc, stdout, stderr)."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except FileNotFoundError:
        return 127, "", "command not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timed out"
    except OSError as e:
        return 126, "", str(e)


def have(cmd):
    return shutil.which(cmd) is not None


def is_termux():
    return ("com.termux" in os.environ.get("PREFIX", "")
            or os.path.isdir("/data/data/com.termux/files"))


def check_environment():
    rows = []

    def add(name, status, detail):
        rows.append({"check": name, "status": status, "detail": detail})

    add("Termux", "OK" if is_termux() else "WARN",
        "Running inside Termux" if is_termux()
        else "Not Termux: Android-specific features will be unavailable")
    add("Python", "OK" if sys.version_info >= (3, 8) else "FAIL", sys.version.split()[0])
    try:
        import rich  # noqa: F401
        add("rich", "OK", "installed")
    except ImportError:
        add("rich", "FAIL", "pip install rich")

    api_pkg = have("termux-wifi-scaninfo")
    add("termux-api package", "OK" if api_pkg else "FAIL",
        "found" if api_pkg else "Missing: pkg install termux-api")

    if api_pkg:
        rc, out, _ = run(["termux-wifi-connectioninfo"], timeout=10)
        if rc == 124:
            add("Termux:API app", "FAIL",
                "No response. Install the Termux:API *app* (same source as Termux, "
                "e.g. F-Droid) and open it once.")
        else:
            try:
                data = json.loads(out)
                if isinstance(data, dict) and "API_ERROR" in data:
                    add("Termux:API app", "WARN", str(data["API_ERROR"]))
                else:
                    add("Termux:API app", "OK",
                        f"responding (state: {data.get('supplicant_state', '?')})")
            except (ValueError, AttributeError):
                add("Termux:API app", "WARN", "unexpected output from termux-wifi-connectioninfo")

        rc, out, _ = run(["termux-wifi-scaninfo"], timeout=25)
        try:
            data = json.loads(out)
        except ValueError:
            data = None
        if rc == 124:
            add("WiFi scan permission", "FAIL", "scan timed out")
        elif isinstance(data, dict) and "API_ERROR" in data:
            add("WiFi scan permission", "WARN", str(data["API_ERROR"]))
        elif isinstance(data, list):
            if not data:
                add("WiFi scan permission", "WARN",
                    "Empty scan: grant Location permission to Termux:API, switch "
                    "Location ON, WiFi ON. Android also throttles scans.")
            elif not all(isinstance(e, dict) for e in data):
                add("WiFi scan permission", "WARN", "unexpected scan output")
            elif all(str(e.get("ssid", "")).startswith("<unknown") for e in data):
                add("WiFi scan permission", "WARN",
                    "SSIDs hidden by Android: Location permission missing for Termux:API")
            else:
                has_caps = any("capabilities" in e for e in data)
                add("WiFi scan permission", "OK", f"{len(data)} networks visible")
                add("Security types in scan", "OK" if has_caps else "WARN",
                    "reported by this Termux:API build" if has_caps else
                    "NOT reported: update termux-api; auditor will show 'Unknown'")
        else:
            add("WiFi scan permission", "WARN", "unexpected scan output")

    add("ip (iproute2)", "OK" if have("ip") else "WARN",
        "found" if have("ip") else "optional: pkg install iproute2 (fallbacks are used)")
    add("ping", "OK" if have("ping") else "WARN",
        "found" if have("ping") else "optional: pkg install inetutils (TCP timing fallback used)")
    add("qrencode", "OK" if have("qrencode") else "OPT",
        "found" if have("qrencode") else "optional: pkg install qrencode (draw QR codes)")
    add("zbarimg", "OK" if have("zbarimg") else "OPT",
        "found" if have("zbarimg") else "optional: pkg install zbar (decode QR images)")

    shared = os.path.isdir(os.path.expanduser("~/storage/shared"))
    add("Shared storage", "OK" if shared else "OPT",
        "~/storage/shared available" if shared
        else "run termux-setup-storage to save reports to shared storage "
             "(default: ~/wsp_reports)")

    rooted = (hasattr(os, "geteuid") and os.geteuid() == 0) or have("su")
    add("Root", "INFO",
        "root/su detected - this toolkit never uses it" if rooted
        else "not rooted (this toolkit does not need root)")

    _, rel, _ = run(["getprop", "ro.build.version.release"], timeout=5)
    _, sdk, _ = run(["getprop", "ro.build.version.sdk"], timeout=5)
    if rel.strip():
        add("Android", "INFO", f"version {rel.strip()} (SDK {sdk.strip() or '?'})")
    return rows


def render_env(rows):
    style = {"OK": "green", "WARN": "yellow", "FAIL": "bold red", "OPT": "dim", "INFO": "cyan"}
    table = Table(title="Environment check", box=box.SIMPLE_HEAD, title_style="bold")
    table.add_column("Check", no_wrap=True)
    table.add_column("Status", no_wrap=True)
    table.add_column("Detail", overflow="fold")
    for r in rows:
        table.add_row(Text(r["check"]), Text(r["status"], style=style.get(r["status"], "")),
                      Text(r["detail"]))
    console.print(table)


LIMITATIONS = [
    ("Saved passwords",
     "Android keeps saved WiFi credentials in protected system storage. Apps and "
     "Termux cannot read them without root, and this toolkit never tries. Use "
     "Android's own Share/QR screen (see menu 2)."),
    ("Scan throttling",
     "Android 9+ limits apps to ~4 WiFi scans per 2 minutes (foreground). "
     "Repeated scans may return cached results."),
    ("Location",
     "Android treats WiFi scan results as location data: Termux:API needs the "
     "Location permission and system Location must be ON."),
    ("Monitor mode / packets",
     "Phone WiFi chips do not expose monitor mode or raw 802.11 frames to apps "
     "without root and special drivers. This toolkit uses only passive scan "
     "results, so no handshake capture, deauth or injection is included."),
    ("MAC addresses",
     "Android 10+ hides some neighbour/ARP data from apps, and phones randomise "
     "MACs. Some hosts may show no MAC. Nothing is fabricated: blanks mean 'not available'."),
    ("Security types",
     "WPA/WPA2/WPA3 detection relies on the 'capabilities' field from "
     "Termux:API. If your build omits it, security shows 'Unknown'."),
]


def show_limitations():
    kv_table("Android / hardware limitations", LIMITATIONS)
