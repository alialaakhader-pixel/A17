import pytest

from wsp import diagnostics as dg

BUSYBOX = """PING 1.1.1.1 (1.1.1.1): 56 data bytes
64 bytes from 1.1.1.1: seq=0 ttl=57 time=10.2 ms
64 bytes from 1.1.1.1: seq=1 ttl=57 time=12.4 ms
64 bytes from 1.1.1.1: seq=2 ttl=57 time=11.0 ms

--- 1.1.1.1 ping statistics ---
5 packets transmitted, 3 packets received, 40% packet loss
round-trip min/avg/max = 10.2/11.2/12.4 ms
"""

TOYBOX_NO_TIMES = """--- 1.1.1.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3004ms
rtt min/avg/max/mdev = 9.1/10.0/11.2/0.8 ms
"""


def test_parse_ping_with_samples():
    r = dg._parse_ping(BUSYBOX, "1.1.1.1")
    assert (r["sent"], r["received"], r["loss_pct"]) == (5, 3, 40.0)
    assert r["min_ms"] == 10.2 and r["max_ms"] == 12.4 and r["avg_ms"] == 11.2
    assert r["method"] == "icmp"


def test_parse_ping_falls_back_to_summary_line():
    r = dg._parse_ping(TOYBOX_NO_TIMES, "1.1.1.1")
    assert r["received"] == 4 and r["avg_ms"] == 10.0


def test_parse_ping_total_loss_and_garbage():
    r = dg._parse_ping("3 packets transmitted, 0 received, 100% packet loss", "x")
    assert r["loss_pct"] == 100.0 and r["avg_ms"] is None
    assert dg._parse_ping("ping: unknown host", "x") is None


@pytest.mark.parametrize("host", ["-c1", "a b", "a;b", "$(id)", "", "x" * 300, "-oProxyCommand=x"])
def test_ping_rejects_unsafe_hosts(host):
    with pytest.raises(ValueError):
        dg.ping(host)


@pytest.mark.parametrize("host", ["1.1.1.1", "example.com", "my-router.local", "fe80::1"])
def test_valid_hosts(host):
    assert dg.valid_host(host)


def test_grade_link():
    perfect = {"loss_pct": 0, "avg_ms": 10, "jitter_ms": 2}
    assert dg.grade_link(perfect, -50) == (100, "Excellent")
    bad = {"loss_pct": 30, "avg_ms": 250, "jitter_ms": 80}
    score, label = dg.grade_link(bad, -90)
    assert label == "Poor" and score < 50
    assert dg.grade_link(None) == (100, "Excellent")


def test_diagnostics_findings():
    d = {"gateway_ping": {"loss_pct": 10, "host": "192.168.1.1", "avg_ms": 80},
         "internet_ping": {"loss_pct": 0, "host": "1.1.1.1", "avg_ms": 20},
         "dns": {"resolvers": ["1.1.1.1"], "direct": [{"ok": False}], "system": [{"ok": False}]}}
    titles = {f.title for f in dg.diagnostics_findings(d)}
    assert titles == {"Packet loss to gateway", "High latency to gateway",
                      "DNS resolvers not answering", "Name resolution failing"}
    assert dg.diagnostics_findings({}) == []


def test_default_gateway_from_ip_route(monkeypatch):
    monkeypatch.setattr(dg, "run", lambda *a, **k: (0, "default via 192.168.1.1 dev wlan0 proto dhcp\n", ""))
    assert dg.default_gateway() == {"ip": "192.168.1.1", "iface": "wlan0", "method": "ip route"}


def test_summarize_jitter_single_sample():
    assert dg._summarize([5.0], 1, "icmp", "x")["jitter_ms"] == 0.0
