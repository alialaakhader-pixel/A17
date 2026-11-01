"""Network discovery, basic port scan and topology report.

SAFETY: private (RFC1918) addresses only, and only after you type AUTHORIZED for
that scope in this session. Public IPs are always refused.
"""
import ipaddress
import re
import socket
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field

from rich import box
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from . import termux_api
from .diagnostics import default_gateway
from .env import run
from .models import Finding
from .ui import (ask, console, err, info, kv_table, menu, ok, pause, progress,
                 show_findings, warn)

MAX_HOSTS = 1024
MAX_PORTS = 4096
PROBE_PORTS = (80, 443, 22, 445, 53, 8080, 62078, 5000, 139, 23)
QUICK_PORTS = (21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 554, 1883, 3389,
               5555, 5900, 7547, 8080, 8443, 9100, 62078)
SERVICES = {5555: "adb", 7547: "tr-069", 62078: "iphone-sync", 9100: "jetdirect",
            1883: "mqtt", 554: "rtsp", 8443: "https-alt", 8080: "http-alt",
            5900: "vnc", 3389: "rdp", 445: "smb", 139: "netbios"}
RISKY = {
    21: ("MEDIUM", "FTP exposed", "FTP sends credentials in clear text.", "Disable FTP or use SFTP."),
    23: ("HIGH", "Telnet exposed", "Telnet is unencrypted and often has weak defaults.",
         "Disable Telnet; use SSH."),
    445: ("MEDIUM", "SMB file sharing reachable", "SMB should not be reachable on untrusted LANs.",
          "Restrict/disable file sharing; keep the host patched."),
    3389: ("MEDIUM", "RDP reachable", "Remote Desktop is a frequent attack target.",
           "Restrict to VPN, enable NLA and strong passwords."),
    5900: ("MEDIUM", "VNC reachable", "VNC is often weakly protected.", "Use a password + tunnel/VPN."),
    5555: ("HIGH", "Android Debug Bridge (ADB) open",
           "An open ADB port allows full device control without authentication on some builds.",
           "Disable wireless debugging when not needed."),
    7547: ("MEDIUM", "TR-069 management port open",
           "ISP remote management exposed on the LAN side.", "Update firmware; restrict if possible."),
    1883: ("MEDIUM", "MQTT broker (unencrypted)", "Often runs without authentication.",
           "Require authentication and TLS (8883)."),
    554: ("LOW", "RTSP video stream reachable", "Camera streams may lack authentication.",
          "Set a strong camera password; isolate cameras on a separate network."),
}


@dataclass
class Host:
    ip: str
    mac: str = ""
    via: str = ""
    latency_ms: float = None
    is_gateway: bool = False
    is_self: bool = False
    random_mac: bool = False
    open_ports: list = field(default_factory=list)   # [{"port":, "service":}]


def is_lan(ip):
    try:
        a = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return (a.version == 4 and a.is_private and not a.is_loopback
            and not a.is_link_local and not a.is_multicast)


def require_authorization(session, scope):
    if scope in session.authorized_scopes:
        return True
    console.print(Panel(
        "Only scan networks and devices that you OWN or have explicit written "
        "permission to test. Unauthorized scanning may be illegal.\n"
        f"Scope: {scope}", title="Authorization required", border_style="yellow"))
    if ask("Type AUTHORIZED to confirm:").upper() == "AUTHORIZED":
        session.authorized_scopes.append(scope)
        return True
    warn("Not authorized. Nothing was scanned.")
    return False


def detect_local_network():
    cands = []
    rc, out, _ = run(["ip", "-o", "-4", "addr", "show"])
    if rc == 0:
        for line in out.splitlines():
            m = re.match(r"^\d+:\s+(\S+)\s+inet\s+(\S+)", line)
            if not m:
                continue
            try:
                itf = ipaddress.ip_interface(m.group(2))
            except ValueError:
                continue
            if is_lan(str(itf.ip)):
                cands.append((m.group(1), itf))
    if cands:
        cands.sort(key=lambda c: (not c[0].startswith("wlan"), c[0]))
        iface, itf = cands[0]
        return {"iface": iface, "ip": str(itf.ip), "cidr": str(itf.network), "assumed": False}
    try:
        ip = termux_api.wifi_connection().get("ip")
        if ip and is_lan(str(ip)):
            itf = ipaddress.ip_interface(f"{ip}/24")
            return {"iface": "wlan", "ip": str(itf.ip), "cidr": str(itf.network), "assumed": True}
    except termux_api.ApiError:
        pass
    return None


def probe_host(ip, timeout=0.35):
    t0 = time.perf_counter()
    for port in PROBE_PORTS:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect((ip, port))
            return True, (time.perf_counter() - t0) * 1000, port
        except ConnectionRefusedError:
            return True, (time.perf_counter() - t0) * 1000, port   # RST = host is up
        except OSError as e:
            if e.errno == 113:        # EHOSTUNREACH: ARP failed, host absent
                return False, None, None
        finally:
            s.close()
    return False, None, None


def read_neighbors():
    res = {}
    rc, out, _ = run(["ip", "neigh", "show"])
    if rc == 0:
        for line in out.splitlines():
            parts = line.split()
            if parts and parts[-1].upper() in ("FAILED", "INCOMPLETE"):
                continue
            m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+.*?lladdr\s+([0-9a-f:]{17})", line, re.I)
            if m:
                res[m.group(1)] = m.group(2).lower()
    if not res:
        try:
            with open("/proc/net/arp") as fh:
                next(fh)
                for line in fh:
                    p = line.split()
                    if len(p) >= 4 and p[2] != "0x0" and p[3] != "00:00:00:00:00:00":
                        res[p[0]] = p[3].lower()
        except (OSError, StopIteration):
            pass
    return res


def _random_mac(mac):
    try:
        return bool(int(mac.split(":")[0], 16) & 0x02)
    except (ValueError, IndexError):
        return False


def sweep(session, net_info):
    net = ipaddress.ip_network(net_info["cidr"], strict=False)
    targets = [str(h) for h in net.hosts()]
    if len(targets) > MAX_HOSTS:
        err(f"{net} has {len(targets)} hosts; limit is {MAX_HOSTS}.")
        return []
    found = {}
    try:
        with progress() as pr:
            task = pr.add_task(f"Probing {net}", total=len(targets))
            with ThreadPoolExecutor(max_workers=96) as ex:
                futs = {ex.submit(probe_host, ip): ip for ip in targets}
                for fut in as_completed(futs):
                    try:
                        alive, ms, port = fut.result()
                    except Exception:
                        alive, ms, port = False, None, None
                    if alive:
                        found[futs[fut]] = (ms, f"tcp/{port}")
                    pr.advance(task)
    except KeyboardInterrupt:
        warn("Interrupted; showing partial results.")
    neigh = read_neighbors()
    tset = set(targets)
    for ip in neigh:
        if ip in tset and ip not in found:
            found[ip] = (None, "arp")
    gw = default_gateway()
    gw_ip = gw["ip"] if gw else None
    found.setdefault(net_info["ip"], (None, "local"))
    hosts = []
    for ip, (ms, via) in found.items():
        mac = neigh.get(ip, "")
        hosts.append(Host(ip=ip, mac=mac, via=via, latency_ms=round(ms, 1) if ms else None,
                          is_gateway=(ip == gw_ip), is_self=(ip == net_info["ip"]),
                          random_mac=_random_mac(mac) if mac else False))
    hosts.sort(key=lambda h: ipaddress.ip_address(h.ip))
    session.hosts = hosts
    session.network = net_info
    return hosts


def show_hosts(hosts):
    t = Table(title=f"Active devices ({len(hosts)})", box=box.SIMPLE_HEAD, header_style="bold cyan")
    for col in ("#", "IP", "MAC", "Note"):
        t.add_column(col, overflow="fold")
    for i, h in enumerate(hosts, 1):
        notes = [n for n, f in (("gateway", h.is_gateway), ("this device", h.is_self),
                                ("random MAC", h.random_mac)) if f]
        t.add_row(str(i), Text(h.ip), Text(h.mac or "n/a", style="dim" if not h.mac else ""),
                  Text(", ".join(notes)))
    console.print(t)
    if not any(h.mac for h in hosts):
        warn("No MAC addresses available: Android hides ARP data from apps on newer versions.")


def parse_ports(spec):
    spec = spec.strip().lower()
    if spec in ("", "quick"):
        return list(QUICK_PORTS)
    ports = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            lo, hi = int(a), int(b)
            if lo > hi:
                raise ValueError("Bad range")
            ports.update(range(lo, hi + 1))
        elif part:
            ports.add(int(part))
    if not ports or min(ports) < 1 or max(ports) > 65535:
        raise ValueError("Ports must be 1-65535")
    if len(ports) > MAX_PORTS:
        raise ValueError(f"Limit is {MAX_PORTS} ports per scan")
    return sorted(ports)


def service_name(port):
    if port in SERVICES:
        return SERVICES[port]
    try:
        return socket.getservbyport(port, "tcp")
    except OSError:
        return "unknown"


def scan_ports(ip, ports, timeout=0.6, workers=128):
    def check(p):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            return p if s.connect_ex((ip, p)) == 0 else None
        except OSError:
            return None
        finally:
            s.close()

    open_ports = []
    with progress() as pr:
        task = pr.add_task(f"Scanning {ip}", total=len(ports))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            for fut in as_completed([ex.submit(check, p) for p in ports]):
                r = fut.result()
                if r:
                    open_ports.append(r)
                pr.advance(task)
    return [{"port": p, "service": service_name(p)} for p in sorted(open_ports)]


def discovery_findings(hosts):
    out = []
    for h in hosts:
        for entry in h.open_ports:
            risk = RISKY.get(entry["port"])
            if risk:
                sev, title, detail, fix = risk
                out.append(Finding(sev, "discovery", title,
                                   f"{detail} (port {entry['port']}/{entry['service']})", fix, h.ip))
    return out


def topology_lines(hosts):
    gw = next((h for h in hosts if h.is_gateway), None)
    lines = ["Internet", "  |"]
    others = [h for h in hosts if h is not gw]
    if gw:
        lines.append(("  +-- Gateway " + gw.ip + (" " + gw.mac if gw.mac else "")))
    else:
        lines.append("  +-- (gateway not identified)")
    for i, h in enumerate(others):
        branch = "`--" if i == len(others) - 1 else "|--"
        tag = " (this device)" if h.is_self else ""
        ports = ",".join(str(p["port"]) for p in h.open_ports)
        bits = [h.ip] + ([h.mac] if h.mac else []) + ([tag.strip()] if tag else [])
        lines.append(f"       {branch} " + " ".join(bits) + (f" ports: {ports}" if ports else ""))
    return lines


def pick_host(session):
    if session.hosts:
        show_hosts(session.hosts)
        raw = ask("Number from list, or an IP:")
    else:
        raw = ask("Target IP (private only):")
    if raw.isdigit() and session.hosts and 1 <= int(raw) <= len(session.hosts):
        return session.hosts[int(raw) - 1].ip
    return raw


def run_menu(session):
    while True:
        c = menu("Network Discovery", [("1", "Local network info"),
                                       ("2", "Discover active devices"),
                                       ("3", "Port scan an authorized device"),
                                       ("4", "Topology report")], back="Back")
        if c == "0":
            return
        try:
            if c == "1":
                n = detect_local_network()
                if n:
                    kv_table("Local network", [("interface", n["iface"]), ("address", n["ip"]),
                                               ("subnet", n["cidr"]),
                                               ("note", "subnet ASSUMED /24" if n["assumed"] else "detected")])
                else:
                    warn("Not connected to a private LAN (or Android hid interface data).")
            elif c == "2":
                n = detect_local_network()
                if not n:
                    warn("Not connected to a private LAN.")
                elif require_authorization(session, n["cidr"]):
                    hosts = sweep(session, n)
                    if hosts:
                        show_hosts(hosts)
            elif c == "3":
                ip = pick_host(session)
                if not is_lan(ip):
                    err("Refused: only private LAN IPv4 addresses are allowed.")
                elif require_authorization(session, ip):
                    ports = parse_ports(ask("Ports: quick | 1-1024 | 22,80,443 [quick]:", "quick"))
                    found = scan_ports(ip, ports)
                    host = next((h for h in session.hosts if h.ip == ip), None)
                    if host is None:
                        host = Host(ip=ip, via="manual")
                        session.hosts.append(host)
                    host.open_ports = found
                    kv_table(f"Open ports on {ip}", [(p["port"], p["service"]) for p in found]
                             or [("none", "no open ports among those scanned")])
                    session.set_findings("discovery", discovery_findings(session.hosts))
                    show_findings(session.findings["discovery"], "Port findings")
            elif c == "4":
                if not session.hosts:
                    warn("Run discovery first (option 2).")
                else:
                    console.print(Text("\n".join(topology_lines(session.hosts))))
        except ValueError as e:
            err(str(e))
        pause()
