"""Network diagnostics: interfaces, gateway, ping, DNS, connection quality."""
import os
import re
import socket
import statistics
import struct
import time

from . import termux_api
from .env import have, run
from .models import Finding
from .ui import (ask, console, err, kv_table, menu, ok, pause, progress,
                 show_findings, warn)

HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-:]*$")


def valid_host(h):
    return bool(HOST_RE.match(h)) and len(h) <= 253


# ---------- interfaces & gateway ----------
def _primary_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))     # UDP connect sends no packet
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def interfaces():
    rows = []
    rc, out, _ = run(["ip", "-o", "addr", "show"])
    if rc == 0:
        for line in out.splitlines():
            m = re.match(r"^\d+:\s+(\S+)\s+(inet6?)\s+(\S+)", line)
            if m:
                rows.append({"name": m.group(1),
                             "family": "IPv6" if m.group(2) == "inet6" else "IPv4",
                             "address": m.group(3)})
    if rows:
        return rows
    try:
        for _, name in socket.if_nameindex():
            rows.append({"name": name, "family": "-", "address": ""})
    except OSError:
        pass
    ip = _primary_ip()
    if ip:
        rows.append({"name": "(default route)", "family": "IPv4", "address": ip})
    return rows


def default_gateway():
    rc, out, _ = run(["ip", "route", "show", "default"])
    if rc == 0:
        m = re.search(r"default via (\S+)(?: dev (\S+))?", out)
        if m:
            return {"ip": m.group(1), "iface": m.group(2) or "?", "method": "ip route"}
    try:
        with open("/proc/net/route") as fh:
            next(fh)
            for line in fh:
                p = line.split()
                if p[1] == "00000000" and int(p[3], 16) & 2:
                    gw = socket.inet_ntoa(struct.pack("<L", int(p[2], 16)))
                    return {"ip": gw, "iface": p[0], "method": "/proc/net/route"}
    except (OSError, IndexError, ValueError, StopIteration):
        pass
    try:
        conn = termux_api.wifi_connection()
        ip = conn.get("ip")
        if ip:
            parts = str(ip).split(".")
            if len(parts) == 4:
                return {"ip": ".".join(parts[:3] + ["1"]), "iface": "wlan?",
                        "method": "ASSUMED x.x.x.1 (Android hid the routing table)"}
    except termux_api.ApiError:
        pass
    return None


# ---------- ping ----------
def _summarize(samples, sent, method, host):
    recv = len(samples)
    res = {"host": host, "method": method, "sent": sent, "received": recv,
           "loss_pct": round(100.0 * (sent - recv) / sent, 1) if sent else 100.0,
           "min_ms": None, "avg_ms": None, "max_ms": None, "jitter_ms": None}
    if samples:
        res.update(min_ms=round(min(samples), 1), avg_ms=round(statistics.mean(samples), 1),
                   max_ms=round(max(samples), 1),
                   jitter_ms=round(statistics.pstdev(samples), 1) if recv > 1 else 0.0)
    return res


def _parse_ping(out, host):
    m = re.search(r"(\d+) packets transmitted, (\d+) (?:packets )?received", out)
    if not m:
        return None
    sent, recv = int(m.group(1)), int(m.group(2))
    samples = [float(x) for x in re.findall(r"time[=<]\s*([\d.]+)\s*ms", out)]
    if not samples and recv:
        r = re.search(r"=\s*([\d.]+)/([\d.]+)/([\d.]+)", out)
        if r:
            samples = [float(r.group(2))] * recv
    return _summarize(samples[:recv] if recv else [], sent, "icmp", host)


def _tcp_ping(host, count, timeout):
    samples = []
    for _ in range(count):
        got = None
        for port in (443, 80, 53):
            t0 = time.perf_counter()
            try:
                socket.create_connection((host, port), timeout=timeout).close()
                got = (time.perf_counter() - t0) * 1000
            except ConnectionRefusedError:
                got = (time.perf_counter() - t0) * 1000   # host answered: RST
            except OSError:
                pass
            if got is not None:
                break
        if got is not None:
            samples.append(got)
        time.sleep(0.2)
    return _summarize(samples, count, "tcp-connect (ICMP unavailable)", host)


def ping(host, count=5, timeout=2):
    if not valid_host(host):
        raise ValueError("Invalid host name")
    if have("ping"):
        rc, out, _ = run(["ping", "-c", str(count), "-W", str(timeout), host],
                         timeout=count * (timeout + 1) + 5)
        res = _parse_ping(out, host)
        if res:
            return res
    return _tcp_ping(host, count, timeout)


# ---------- DNS ----------
def dns_resolvers():
    found = []
    for i in range(1, 5):
        rc, out, _ = run(["getprop", f"net.dns{i}"], timeout=4)
        if rc == 0 and re.fullmatch(r"\d+\.\d+\.\d+\.\d+", out.strip()):
            found.append(out.strip())
    prefix = os.environ.get("PREFIX", "")
    for path in (os.path.join(prefix, "etc", "resolv.conf"), "/etc/resolv.conf"):
        try:
            with open(path) as fh:
                found += re.findall(r"^nameserver\s+(\d+\.\d+\.\d+\.\d+)", fh.read(), re.M)
        except OSError:
            pass
    return list(dict.fromkeys(found))


def dns_query(server, name="example.com", timeout=2.0):
    tid = os.urandom(2)
    header = tid + b"\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00"
    qname = b"".join(bytes([len(p)]) + p.encode() for p in name.split(".")) + b"\x00"
    packet = header + qname + b"\x00\x01\x00\x01"
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(timeout)
    try:
        t0 = time.perf_counter()
        s.sendto(packet, (server, 53))
        data, _ = s.recvfrom(2048)
        ms = (time.perf_counter() - t0) * 1000
        if len(data) < 12 or data[:2] != tid:
            return {"server": server, "ok": False, "error": "bad reply"}
        rcode, answers = data[3] & 0x0F, int.from_bytes(data[6:8], "big")
        return {"server": server, "ok": rcode == 0 and answers > 0, "ms": round(ms, 1),
                "rcode": rcode, "answers": answers}
    except OSError as e:
        return {"server": server, "ok": False, "error": str(e) or "timeout"}
    finally:
        s.close()


def dns_diagnostics():
    resolvers = dns_resolvers()
    direct = [dns_query(r) for r in resolvers[:4]]
    system = []
    for name in ("example.com", "cloudflare.com", "wikipedia.org"):
        t0 = time.perf_counter()
        try:
            socket.getaddrinfo(name, 443)
            system.append({"name": name, "ok": True,
                           "ms": round((time.perf_counter() - t0) * 1000, 1)})
        except OSError as e:
            system.append({"name": name, "ok": False, "error": str(e)})
    return {"resolvers": resolvers, "direct": direct, "system": system}


# ---------- quality ----------
def grade_link(ping_res, rssi=None):
    score = 100
    if ping_res:
        score -= min(60, ping_res["loss_pct"] * 4)
        avg = ping_res.get("avg_ms")
        if avg is not None:
            score -= 35 if avg > 200 else (20 if avg > 100 else (10 if avg > 50 else 0))
        jit = ping_res.get("jitter_ms")
        if jit is not None:
            score -= 20 if jit > 50 else (10 if jit > 20 else 0)
    if rssi is not None:
        score -= 20 if rssi < -85 else (10 if rssi < -75 else 0)
    score = max(0, int(score))
    label = ("Excellent" if score >= 85 else "Good" if score >= 70
             else "Fair" if score >= 50 else "Poor")
    return score, label


def diagnostics_findings(d):
    out = []
    gw, net = d.get("gateway_ping"), d.get("internet_ping")
    if gw and gw["loss_pct"] >= 5:
        out.append(Finding("MEDIUM", "diagnostics", "Packet loss to gateway",
                           f"{gw['loss_pct']}% loss to {gw['host']}: the WiFi link is unstable.",
                           "Move closer to the router, change channel/band, check interference.",
                           gw["host"]))
    if gw and gw.get("avg_ms") and gw["avg_ms"] > 50:
        out.append(Finding("LOW", "diagnostics", "High latency to gateway",
                           f"Average {gw['avg_ms']} ms to the router (a healthy LAN is <10 ms).",
                           "Check signal strength and congestion.", gw["host"]))
    if net and net["loss_pct"] >= 5:
        out.append(Finding("MEDIUM", "diagnostics", "Packet loss to the Internet",
                           f"{net['loss_pct']}% loss to {net['host']}.",
                           "Test with another network to isolate router vs ISP.", net["host"]))
    dns = d.get("dns")
    if dns:
        if dns["resolvers"] and not any(r.get("ok") for r in dns["direct"]):
            out.append(Finding("MEDIUM", "diagnostics", "DNS resolvers not answering",
                               "None of the configured DNS servers answered a direct query.",
                               "Check router DNS settings or try a trusted resolver.",
                               ", ".join(dns["resolvers"])))
        if dns["system"] and not any(r["ok"] for r in dns["system"]):
            out.append(Finding("HIGH", "diagnostics", "Name resolution failing",
                               "The system resolver could not resolve any test domain.",
                               "Check Internet access and DNS configuration.", "system resolver"))
    return out


def run_full(session):
    d = {}
    steps = 6
    with progress() as pr:
        task = pr.add_task("Diagnostics", total=steps)
        d["interfaces"] = interfaces(); pr.advance(task)
        d["gateway"] = default_gateway(); pr.advance(task)
        gw_ip = d["gateway"]["ip"] if d["gateway"] else None
        d["gateway_ping"] = ping(gw_ip) if gw_ip else None; pr.advance(task)
        d["internet_ping"] = ping("1.1.1.1"); pr.advance(task)
        d["dns"] = dns_diagnostics(); pr.advance(task)
        try:
            d["wifi_link"] = termux_api.wifi_connection()
        except termux_api.ApiError:
            d["wifi_link"] = None
        pr.advance(task)
    rssi = (d["wifi_link"] or {}).get("rssi")
    d["quality"] = dict(zip(("score", "label"), grade_link(d["internet_ping"], rssi)))
    session.diagnostics = d
    session.set_findings("diagnostics", diagnostics_findings(d))
    show_summary(d)
    show_findings(session.findings["diagnostics"], "Diagnostics findings")


def _ping_rows(res):
    return [("host", res["host"]), ("method", res["method"]),
            ("sent/received", f"{res['sent']}/{res['received']}"),
            ("loss", f"{res['loss_pct']}%"), ("min/avg/max ms",
             f"{res['min_ms']}/{res['avg_ms']}/{res['max_ms']}"),
            ("jitter ms", res["jitter_ms"])]


def show_summary(d):
    if d.get("quality"):
        kv_table("Connection quality", [("score", f"{d['quality']['score']}/100"),
                                        ("rating", d["quality"]["label"])])
    if d.get("gateway"):
        g = d["gateway"]
        kv_table("Gateway", [("ip", g["ip"]), ("interface", g["iface"]), ("found via", g["method"])])
    else:
        warn("Gateway could not be determined.")
    for key, title in (("gateway_ping", "Ping gateway"), ("internet_ping", "Ping Internet")):
        if d.get(key):
            kv_table(title, _ping_rows(d[key]))
    if d.get("dns"):
        rows = [("resolvers", ", ".join(d["dns"]["resolvers"]) or "none found")]
        for r in d["dns"]["direct"]:
            rows.append((f"query {r['server']}", f"{r['ms']} ms" if r["ok"] else f"FAIL {r.get('error', r.get('rcode'))}"))
        for r in d["dns"]["system"]:
            rows.append((f"system: {r['name']}", f"{r['ms']} ms" if r["ok"] else "FAIL"))
        kv_table("DNS", rows)


def run_menu(session):
    while True:
        c = menu("Network Diagnostics", [("1", "Full diagnostics"), ("2", "Ping a host"),
                                         ("3", "DNS test"), ("4", "Gateway"),
                                         ("5", "Interfaces")], back="Back")
        if c == "0":
            return
        try:
            if c == "1":
                run_full(session)
            elif c == "2":
                host = ask("Host or IP [1.1.1.1]:", "1.1.1.1")
                with console.status("Pinging..."):
                    res = ping(host)
                kv_table("Ping", _ping_rows(res))
                sc, lab = grade_link(res)
                ok(f"Quality: {lab} ({sc}/100)")
            elif c == "3":
                with console.status("Querying DNS..."):
                    session.diagnostics["dns"] = dns_diagnostics()
                show_summary({"dns": session.diagnostics["dns"]})
            elif c == "4":
                g = default_gateway()
                kv_table("Gateway", [(k, v) for k, v in g.items()]) if g else warn("Not found.")
            elif c == "5":
                kv_table("Interfaces", [(r["name"], f"{r['family']} {r['address']}") for r in interfaces()])
        except ValueError as e:
            err(str(e))
        pause()
