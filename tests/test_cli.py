import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(*args, stdin=None):
    return subprocess.run([sys.executable, os.path.join(ROOT, "main.py"), *args],
                          capture_output=True, text=True, input=stdin, timeout=60, cwd=ROOT)


def test_version():
    p = run("--version")
    assert p.returncode == 0 and "1.1.0" in p.stdout


def test_scan_demo_json_is_clean_stdout():
    p = run("scan", "--demo", "--json")
    assert p.returncode == 0
    data = json.loads(p.stdout)                      # stdout must be pure JSON
    assert len(data) == 13 and "DEMO MODE" in p.stderr


def test_audit_demo_json_and_redact():
    p = run("audit", "--demo", "--json", "--redact")
    assert p.returncode == 0
    rep = json.loads(p.stdout)
    assert rep["summary"]["risk_grade"] == "F" and rep["summary"]["counts"]["CRITICAL"] == 1
    assert "02:00:00:aa:00:01" not in p.stdout


def test_fail_on_exit_codes():
    assert run("audit", "--demo", "--json", "--fail-on", "CRITICAL").returncode == 2
    assert run("audit", "--demo", "--json").returncode == 0


def test_audit_demo_pretty_and_save(tmp_path):
    p = run("audit", "--demo", "--save", "--redact", "--out", str(tmp_path))
    assert p.returncode == 0 and "Overall grade: F" in p.stdout
    files = sorted(os.listdir(tmp_path))
    assert len(files) == 2 and files[0].endswith(".json") and files[1].endswith(".txt")


def test_passwd_generate_json():
    p = run("passwd", "--generate", "24", "--json")
    assert p.returncode == 0
    res = json.loads(p.stdout)
    assert res["length"] == 24 and res["rating"] in ("Strong", "Very strong")


def test_scan_without_termux_api_fails_cleanly():
    p = run("scan", "--json")
    assert p.returncode == 1 and p.stdout.strip() == ""      # nothing on stdout, error on stderr
