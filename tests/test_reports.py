import json
import os
import re
import stat

from wsp import auditor, discovery, reports, scanner
from wsp.models import Session

FULL_MAC = re.compile(r"\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b", re.I)
UNREDACTED = re.compile(r"\b(?:[0-9a-f]{2}:){2}[0-9a-f]{2}:(?!xx)[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}\b", re.I)


def make_session(demo_conn=True):
    s = Session()
    s.access_points = scanner.scan_networks()
    s.connection = {"ssid": "HomeNet", "bssid": "02:00:00:aa:00:02", "rssi": -52}
    s.set_findings("wifi", auditor.audit_access_points(s.access_points, "02:00:00:aa:00:02"))
    gw = discovery.Host(ip="192.168.1.1", mac="aa:bb:cc:11:22:33", is_gateway=True)
    s.hosts = [gw, discovery.Host(ip="192.168.1.9", mac="aa:bb:cc:44:55:66")]
    s.diagnostics = {"wifi_link": {"bssid": "aa:bb:cc:77:88:99", "rssi": -50}}
    return s


def test_redaction_removes_every_mac_everywhere(demo):
    text = json.dumps(reports.build_report(make_session(), redact=True))
    assert not UNREDACTED.search(text), UNREDACTED.findall(text)
    assert "02:00:00:xx:xx:xx" in text


def test_without_redaction_macs_are_kept(demo):
    text = json.dumps(reports.build_report(make_session(), redact=False))
    assert "02:00:00:aa:00:02" in text and "aa:bb:cc:11:22:33" in text


def test_topology_is_redacted(demo):
    r = reports.build_report(make_session(), redact=True)
    assert r["topology"] and not any(UNREDACTED.search(line) for line in r["topology"])


def test_secrets_never_reach_report(demo):
    s = make_session()
    s.diagnostics["password"] = "hunter2"
    s.diagnostics["nested"] = {"wifi_psk": "abc", "api_key": "k", "ok": 1}
    text = json.dumps(reports.build_report(s))
    assert "hunter2" not in text and "wifi_psk" not in text and "api_key" not in text
    assert '"ok": 1' in text


def test_summary_counts_match_findings(demo):
    r = reports.build_report(make_session())
    assert sum(r["summary"]["counts"].values()) == len(r["findings"])
    assert r["summary"]["risk_grade"] == "F"            # demo data contains a WEP network


def test_txt_render_contains_sections(demo):
    txt = reports.render_txt(reports.build_report(make_session()))
    for part in ("SUMMARY", "FINDINGS", "ACCESS POINTS", "DEVICES", "TOPOLOGY", "NOTES"):
        assert part in txt


def test_save_reports_private_and_never_overwrites(demo, tmp_path):
    s = make_session()
    j1, t1 = reports.save_reports(s, directory=str(tmp_path / "out"))
    j2, t2 = reports.save_reports(s, directory=str(tmp_path / "out"))
    assert len({j1, t1, j2, t2}) == 4 and all(os.path.exists(p) for p in (j1, t1, j2, t2))
    for p in (j1, t1):
        assert stat.S_IMODE(os.stat(p).st_mode) == 0o600
    assert json.load(open(j1, encoding="utf-8"))["tool"]


def test_empty_session_grade():
    assert Session().risk_grade() == "N/A"
