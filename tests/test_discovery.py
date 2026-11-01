import socket

import pytest

from wsp import discovery as d
from wsp.models import Session


@pytest.mark.parametrize("ip,ok", [("192.168.1.5", True), ("10.0.0.1", True), ("172.16.5.5", True),
                                   ("8.8.8.8", False), ("127.0.0.1", False), ("169.254.1.1", False),
                                   ("224.0.0.1", False), ("::1", False), ("not-an-ip", False),
                                   ("1.1.1.1", False), ("192.168.1.0/24", False)])
def test_is_lan(ip, ok):
    assert d.is_lan(ip) is ok


def test_parse_ports():
    assert d.parse_ports("") == list(d.QUICK_PORTS)
    assert d.parse_ports("80, 22,443") == [22, 80, 443]
    assert d.parse_ports("20-22") == [20, 21, 22]
    for bad in ("0", "70000", "5-1", "abc", "1-5000"):
        with pytest.raises(ValueError):
            d.parse_ports(bad)


def test_authorization_requires_typed_confirmation(monkeypatch):
    s = Session()
    monkeypatch.setattr(d, "ask", lambda *_: "yes")
    assert d.require_authorization(s, "192.168.1.0/24") is False
    assert s.authorized_scopes == []
    monkeypatch.setattr(d, "ask", lambda *_: "authorized")
    assert d.require_authorization(s, "192.168.1.0/24") is True
    monkeypatch.setattr(d, "ask", lambda *_: pytest.fail("must not ask twice for the same scope"))
    assert d.require_authorization(s, "192.168.1.0/24") is True


def test_scan_ports_finds_only_open_port():
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(5)
    port = srv.getsockname()[1]
    try:
        free = socket.socket()
        free.bind(("127.0.0.1", 0))
        closed = free.getsockname()[1]
        free.close()
        found = d.scan_ports("127.0.0.1", [port, closed], timeout=0.5, workers=4)
    finally:
        srv.close()
    assert [p["port"] for p in found] == [port]


def test_findings_and_topology():
    gw = d.Host(ip="192.168.1.1", is_gateway=True, open_ports=[{"port": 23, "service": "telnet"}])
    me = d.Host(ip="192.168.1.5", is_self=True)
    cam = d.Host(ip="192.168.1.9", mac="02:aa:bb:cc:dd:ee", open_ports=[{"port": 554, "service": "rtsp"}])
    f = d.discovery_findings([gw, me, cam])
    assert {(x.severity, x.target) for x in f} == {("HIGH", "192.168.1.1"), ("LOW", "192.168.1.9")}
    lines = d.topology_lines([gw, me, cam])
    assert lines[0] == "Internet" and "Gateway 192.168.1.1" in lines[2]
    assert any("(this device)" in line for line in lines)
    assert any("ports: 554" in line for line in lines)


def test_read_neighbors_parses_ip_neigh(monkeypatch):
    out = ("192.168.1.1 dev wlan0 lladdr AA:BB:CC:DD:EE:01 REACHABLE\n"
           "192.168.1.7 dev wlan0  FAILED\n"
           "192.168.1.9 dev wlan0 lladdr aa:bb:cc:dd:ee:09 STALE\n")
    monkeypatch.setattr(d, "run", lambda *a, **k: (0, out, ""))
    assert d.read_neighbors() == {"192.168.1.1": "aa:bb:cc:dd:ee:01",
                                  "192.168.1.9": "aa:bb:cc:dd:ee:09"}


def test_random_mac_bit():
    assert d._random_mac("02:00:00:00:00:00") is True
    assert d._random_mac("00:11:22:33:44:55") is False
