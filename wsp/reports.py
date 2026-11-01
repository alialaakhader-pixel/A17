"""Report generator: JSON and TXT. Saved WiFi passwords are never included."""
import json
import os
import platform
import re
from collections import Counter
from dataclasses import asdict
from datetime import datetime

from . import APP_NAME, __version__
from .discovery import topology_lines
from .models import SEV_ORDER
from .ui import err, kv_table, menu, ok, pause, ask, confirm, warn

SECRET_KEYS = re.compile(r"pass|psk|secret|key", re.I)
MAC_RE = re.compile(r"\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b", re.I)


def redact_mac(mac):
    parts = str(mac).split(":")
    if len(parts) == 6:
        return ":".join(parts[:3] + ["xx", "xx", "xx"])
    return mac


def _redact_all(obj):
    """Redact every MAC-looking string anywhere in the report (topology, diagnostics, ...)."""
    if isinstance(obj, dict):
        return {k: _redact_all(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_redact_all(v) for v in obj]
    if isinstance(obj, str):
        return MAC_RE.sub(lambda m: redact_mac(m.group(0)), obj)
    return obj


def _scrub(obj):
    """Defence in depth: drop anything that looks like a credential field."""
    if isinstance(obj, dict):
        return {k: _scrub(v) for k, v in obj.items() if not SECRET_KEYS.search(str(k))}
    if isinstance(obj, list):
        return [_scrub(v) for v in obj]
    return obj


def build_report(session, redact=False):
    findings = [asdict(f) for f in session.all_findings()]
    aps = [{**asdict(a), "signal_pct": a.signal_pct} for a in session.access_points]
    hosts = [asdict(h) for h in session.hosts]
    conn = dict(session.connection) if session.connection else None
    if redact:
        for a in aps:
            a["bssid"] = redact_mac(a["bssid"])
        for h in hosts:
            h["mac"] = redact_mac(h["mac"]) if h["mac"] else ""
        if conn:
            conn["bssid"] = redact_mac(conn.get("bssid", ""))
        for f in findings:
            f["target"] = re.sub(r"([0-9a-f]{2}:){3}([0-9a-f]{2}:){2}[0-9a-f]{2}",
                                 lambda m: redact_mac(m.group(0)), f["target"])
    counts = Counter(f["severity"] for f in findings)
    report = {
        "tool": APP_NAME, "version": __version__,
        "generated": datetime.now().isoformat(timespec="seconds"),
        "session_started": session.started,
        "device": {"platform": platform.system(), "python": platform.python_version()},
        "scope": {"authorized": list(session.authorized_scopes), "network": session.network},
        "summary": {"risk_grade": session.risk_grade(),
                    "counts": {s: counts.get(s, 0) for s in SEV_ORDER},
                    "access_points": len(aps), "hosts": len(hosts)},
        "findings": findings, "access_points": aps, "connection": conn,
        "hosts": hosts, "topology": topology_lines(session.hosts) if session.hosts else [],
        "diagnostics": session.diagnostics,
        "notes": ["Passive scan data only; no attack traffic was generated.",
                  "Missing values mean Android did not expose them; nothing was fabricated."],
    }
    report = _scrub(report)
    return _redact_all(report) if redact else report


def render_txt(r):
    L = ["=" * 64, f" {r['tool']} v{r['version']} - Security Report",
         f" Generated: {r['generated']}", f" Overall risk grade: {r['summary']['risk_grade']}",
         "=" * 64, "", "SUMMARY"]
    c = r["summary"]["counts"]
    L.append("  " + " | ".join(f"{k}: {v}" for k, v in c.items()))
    L.append(f"  Access points: {r['summary']['access_points']}   Hosts: {r['summary']['hosts']}")
    L += ["", "SCOPE", f"  Authorized scopes: {', '.join(r['scope']['authorized']) or 'none'}", "",
          "FINDINGS"]
    if not r["findings"]:
        L.append("  None recorded (run the auditor / discovery / diagnostics first).")
    for f in r["findings"]:
        L += [f"  [{f['severity']}] {f['title']}",
              f"     Target : {f['target'] or '-'}", f"     Detail : {f['detail']}",
              f"     Fix    : {f['recommendation']}", ""]
    if r["access_points"]:
        L += ["ACCESS POINTS"]
        for a in r["access_points"]:
            name = "(hidden)" if a["hidden"] else (a["ssid"] or "(masked)")
            L.append(f"  {name[:24]:<24} {a['security']:<22} ch{a['channel'] or '?':<4} "
                     f"{a['rssi']} dBm  {a['bssid']}")
        L.append("")
    if r["hosts"]:
        L.append("DEVICES")
        for h in r["hosts"]:
            ports = ",".join(str(p["port"]) for p in h["open_ports"]) or "-"
            L.append(f"  {h['ip']:<16} {h['mac'] or 'n/a':<18} ports: {ports}")
        L += ["", "TOPOLOGY"] + [f"  {x}" for x in r["topology"]] + [""]
    d = r.get("diagnostics") or {}
    if d:
        L.append("DIAGNOSTICS")
        if d.get("quality"):
            L.append(f"  Quality: {d['quality']['label']} ({d['quality']['score']}/100)")
        for key in ("gateway_ping", "internet_ping"):
            p = d.get(key)
            if p:
                L.append(f"  {key}: {p['host']} loss {p['loss_pct']}% avg {p['avg_ms']} ms "
                         f"jitter {p['jitter_ms']} ms ({p['method']})")
        L.append("")
    L += ["NOTES"] + [f"  - {n}" for n in r["notes"]]
    return "\n".join(L) + "\n"


def default_dir():
    if os.environ.get("WSP_REPORT_DIR"):
        return os.path.expanduser(os.environ["WSP_REPORT_DIR"])
    shared = os.path.expanduser("~/storage/shared")
    return os.path.join(shared, "WiFiSecurityPro") if os.path.isdir(shared) \
        else os.path.expanduser("~/wsp_reports")


def save_reports(session, directory=None, redact=False):
    directory = directory or default_dir()
    os.makedirs(directory, exist_ok=True)
    report = build_report(session, redact)
    base = f"wsp_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    n = 0
    while any(os.path.exists(os.path.join(directory, f"{base}{'' if not n else f'_{n}'}.{e}"))
              for e in ("json", "txt")):
        n += 1                      # never overwrite an earlier report from the same second
    base += "" if not n else f"_{n}"
    jpath = os.path.join(directory, base + ".json")
    tpath = os.path.join(directory, base + ".txt")
    _write_private(jpath, json.dumps(report, indent=2, ensure_ascii=False, default=str))
    _write_private(tpath, render_txt(report))
    return jpath, tpath


def _write_private(path, text):
    """Create the file already restricted to the owner (no world-readable window)."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(text)


def run_menu(session):
    while True:
        c = menu("Report Generator", [("1", "Save JSON + TXT report"),
                                      ("2", "Save with MAC addresses redacted"),
                                      ("3", "Preview TXT report")], back="Back")
        if c == "0":
            return
        try:
            if c in ("1", "2"):
                if not (session.access_points or session.hosts or session.diagnostics):
                    warn("Session is empty; the report will contain no data.")
                    if not confirm("Save anyway?"):
                        continue
                j, t = save_reports(session, redact=(c == "2"))
                ok("Saved:")
                kv_table("Files", [("JSON", j), ("TXT", t)])
            elif c == "3":
                from .ui import console
                console.print(render_txt(build_report(session)), markup=False, highlight=False)
        except OSError as e:
            err(f"Could not write report: {e}")
        pause()
