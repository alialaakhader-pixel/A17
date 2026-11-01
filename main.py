#!/usr/bin/env python3
"""WiFi Security Pro Ultimate - entry point.

Usage:
  python main.py            interactive menu
  python main.py check      environment / Termux:API / permission check
  python main.py scan       one-shot WiFi scan
  python main.py audit [--save] [--redact] [--out DIR] [--json] [--fail-on SEV]
  python main.py passwd [--wordlist FILE] [--generate N] [--json]
Add --demo to any command to use synthetic data (no Android / Termux:API needed).
"""
import argparse
import getpass
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def ensure_deps():
    try:
        import rich  # noqa: F401
        return
    except ImportError:
        pass
    print("The 'rich' package is required for the interface.")
    if input("Install it now with pip? [Y/n] ").strip().lower() in ("", "y", "yes"):
        rc = subprocess.call([sys.executable, "-m", "pip", "install", "-r",
                              os.path.join(HERE, "requirements.txt")])
        if rc == 0:
            return
    sys.exit("Install manually: pip install rich")


ensure_deps()

from wsp import APP_NAME, __version__                      # noqa: E402
from wsp import (auditor, diagnostics, discovery, env, password_analyzer,  # noqa: E402
                 reports, saved_wifi, scanner, termux_api)
from wsp.models import SEV_ORDER                           # noqa: E402
from wsp.models import Session                             # noqa: E402
from wsp.ui import (banner, console, err, info, kv_table, menu, pause,  # noqa: E402
                    show_findings, warn)  # noqa: E402


def env_menu(session):
    while True:
        c = menu("Environment & Limitations", [("1", "Run environment check"),
                                               ("2", "Android / hardware limitations")], back="Back")
        if c == "0":
            return
        if c == "1":
            with console.status("Checking (a scan is requested, this can take ~20s)..."):
                rows = env.check_environment()
            env.render_env(rows)
        else:
            env.show_limitations()
        pause()


def header():
    kv_table("Status", [
        ("Termux", "yes" if env.is_termux() else "no"),
        ("Termux:API", "installed" if env.have("termux-wifi-scaninfo") else "MISSING (pkg install termux-api)"),
    ])


def interactive():
    session = Session()
    banner()
    header()
    while True:
        c = menu("Main Menu", [
            ("1", "WiFi Network Scanner"),
            ("2", "Saved WiFi Password Recovery (own device)"),
            ("3", "Password Security Analyzer"),
            ("4", "WiFi Security Auditor"),
            ("5", "Network Discovery (authorized)"),
            ("6", "Network Diagnostics"),
            ("7", "Report Generator"),
            ("8", "Environment check / limitations"),
        ], back="Exit")
        if c == "0":
            console.print("Stay safe. Bye!")
            return
        {"1": scanner.run_menu, "2": saved_wifi.run_menu, "3": password_analyzer.run_menu,
         "4": auditor.run_menu, "5": discovery.run_menu, "6": diagnostics.run_menu,
         "7": reports.run_menu, "8": env_menu}[c](session)


def cmd_check():
    banner()
    with console.status("Checking environment..."):
        rows = env.check_environment()
    env.render_env(rows)
    env.show_limitations()
    return 1 if any(r["status"] == "FAIL" for r in rows) else 0


def _demo_note(args):
    if getattr(args, "demo", False):
        msg = "DEMO MODE: synthetic data, nothing was scanned."
        if args.json:
            print(msg, file=sys.stderr)
        else:
            warn(msg)


def cmd_scan(args):
    s = Session()
    if not scanner.do_scan(s, quiet=args.json):
        return 1
    if args.json:
        rep = reports.build_report(s, redact=args.redact)
        print(json.dumps(rep["access_points"], indent=2, ensure_ascii=False))
    else:
        scanner.render_table(s.access_points)
    return 0


def cmd_audit(args):
    s = Session()
    if not scanner.do_scan(s, quiet=args.json):
        return 1
    try:
        s.connection = termux_api.wifi_connection()
    except termux_api.ApiError:
        s.connection = None          # not connected / not exposed: audit still works
    cb = str((s.connection or {}).get("bssid", "")).lower() or None
    findings = auditor.audit_access_points(s.access_points, cb)
    if args.redact:                  # also hide MACs in the on-screen findings, not just files
        for f in findings:
            f.target = reports.MAC_RE.sub(lambda m: reports.redact_mac(m.group(0)), f.target)
    s.set_findings("wifi", findings)
    saved = None
    if args.save:
        saved = reports.save_reports(s, directory=args.out, redact=args.redact)
    if args.json:
        print(json.dumps(reports.build_report(s, redact=args.redact), indent=2,
                         ensure_ascii=False))
    else:
        scanner.render_table(s.access_points)
        show_findings([f for f in findings if f.severity != "INFO"] or findings, "WiFi audit")
        console.print(f"Overall grade: {s.risk_grade()}")
        if saved:
            info(f"Saved {saved[0]}\nSaved {saved[1]}")
    if args.fail_on:
        limit = SEV_ORDER[args.fail_on]
        if any(SEV_ORDER.get(f.severity, 9) <= limit for f in findings):
            return 2
    return 0


def cmd_passwd(args):
    if args.generate:
        pw = password_analyzer.generate_password(args.generate)
    else:
        pw = getpass.getpass("Password (hidden, analysed locally, never stored): ")
        if not pw:
            err("Empty input.")
            return 1
    res = password_analyzer.analyze(pw, args.wordlist)
    if args.json:
        print(json.dumps(res, indent=2, ensure_ascii=False))
    else:
        if args.generate:
            console.print(f"\n  {pw}\n", markup=False, style="bold green")
        password_analyzer.show_analysis(res)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="main.py", description=APP_NAME)
    ap.add_argument("command", nargs="?", default="menu",
                    choices=["menu", "check", "scan", "audit", "passwd"])
    ap.add_argument("--demo", action="store_true",
                    help="use synthetic scan data (works on any computer)")
    ap.add_argument("--json", action="store_true",
                    help="scan/audit/passwd: machine-readable JSON on stdout")
    ap.add_argument("--save", action="store_true", help="audit: save JSON+TXT reports")
    ap.add_argument("--out", metavar="DIR", help="audit --save: report directory")
    ap.add_argument("--redact", action="store_true", help="redact MAC addresses in output/reports")
    ap.add_argument("--fail-on", choices=["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                    help="audit: exit with code 2 if a finding of this severity or worse exists")
    ap.add_argument("--wordlist", metavar="FILE", help="passwd: local wordlist to check against")
    ap.add_argument("--generate", type=int, metavar="N",
                    help="passwd: generate and analyse a random N-character password")
    ap.add_argument("--version", action="version", version=f"{APP_NAME} {__version__}")
    args = ap.parse_args(argv)
    if args.demo:
        termux_api.set_demo(True)
    try:
        if args.command == "check":
            return cmd_check()
        if args.command == "passwd":
            return cmd_passwd(args)
        if args.command in ("scan", "audit"):
            _demo_note(args)
            return cmd_scan(args) if args.command == "scan" else cmd_audit(args)
        _demo_note(args)
        interactive()
        return 0
    except (KeyboardInterrupt, EOFError):
        console.print("\nInterrupted.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
