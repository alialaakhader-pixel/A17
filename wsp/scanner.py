"""WiFi network scanner (passive, via Termux:API scan results)."""
import contextlib
import re
import sys
from collections import Counter
from dataclasses import dataclass, field

from rich import box
from rich.table import Table
from rich.text import Text

from . import termux_api
from .ui import console, err, kv_table, menu, ok, pause, warn

UNKNOWN_SSID_MARKERS = ("<unknown ssid>", "<unknown>")
HIDDEN_MARKERS = ("", "<hidden>", "\x00")


@dataclass
class AccessPoint:
    ssid: str
    bssid: str
    rssi: int = None
    frequency: int = None
    channel: int = None
    band: str = "?"
    width: int = None
    security: str = "Unknown"
    ciphers: list = field(default_factory=list)
    wps: bool = None
    pmf: str = None
    hidden: bool = False
    capabilities: str = None

    @property
    def signal_pct(self):
        if self.rssi is None:
            return 0
        return max(0, min(100, 2 * (self.rssi + 100)))


def freq_to_channel(f):
    if f is None:
        return None
    if f == 2484:
        return 14
    if 2412 <= f <= 2472:
        return (f - 2407) // 5
    if 5160 <= f <= 5885:
        return (f - 5000) // 5
    if 5955 <= f <= 7115:
        return (f - 5950) // 5
    return None


def band_of(f):
    if f is None:
        return "?"
    if f < 3000:
        return "2.4 GHz"
    if f < 5900:
        return "5 GHz"
    return "6 GHz"


def parse_security(caps):
    """Translate an Android capabilities string such as
    '[WPA2-PSK-CCMP][RSN-SAE-CCMP][ESS][WPS]' into a label and flags.
    Returns label 'Unknown' if the string is not provided (nothing is guessed)."""
    if caps is None:
        return {"label": "Unknown", "ciphers": [], "wps": None, "pmf": None}
    toks = re.findall(r"\[([^\]]+)\]", str(caps).upper())
    joined = " ".join(toks)
    sae, psk = "SAE" in joined, "PSK" in joined
    eap, owe = "EAP" in joined, "OWE" in joined
    wpa1 = any(t.startswith("WPA-") for t in toks)
    wpa2 = any(t.startswith(("WPA2-", "RSN-")) for t in toks)
    if owe:
        label = "OWE (Enhanced Open)"
    elif eap:
        label = "WPA3-Enterprise" if "SUITE" in joined else "WPA2/3-Enterprise"
    elif sae and psk:
        label = "WPA2/WPA3 (transition)"
    elif sae:
        label = "WPA3-SAE"
    elif psk and wpa1 and wpa2:
        label = "WPA/WPA2 (mixed)"
    elif psk and wpa2:
        label = "WPA2-PSK"
    elif psk and wpa1:
        label = "WPA-PSK"
    elif "WEP" in toks:
        label = "WEP"
    elif "ESS" in toks or "IBSS" in toks:
        label = "Open"
    else:
        label = "Unknown"
    ciphers = [c for c in ("TKIP", "CCMP", "GCMP") if c in joined]
    pmf = "required" if "MFPR" in toks else ("capable" if "MFPC" in toks else "none")
    return {"label": label, "ciphers": ciphers, "wps": "WPS" in toks, "pmf": pmf}


def _int(v):
    if v is None:
        return None
    m = re.search(r"-?\d+", str(v))
    return int(m.group()) if m else None


def from_raw(e):
    freq = _int(e.get("frequency_mhz", e.get("frequency")))
    caps = e.get("capabilities")
    sec = parse_security(caps)
    raw_ssid = (e.get("ssid") or "").strip()
    unknown = raw_ssid.lower() in UNKNOWN_SSID_MARKERS
    hidden = (not unknown) and raw_ssid.lower() in HIDDEN_MARKERS
    return AccessPoint(
        ssid="" if hidden else raw_ssid, bssid=str(e.get("bssid", "")).lower(),
        rssi=_int(e.get("rssi")), frequency=freq, channel=freq_to_channel(freq),
        band=band_of(freq), width=_int(e.get("channel_bandwidth_mhz")),
        security=sec["label"], ciphers=sec["ciphers"], wps=sec["wps"], pmf=sec["pmf"],
        hidden=hidden, capabilities=caps)


def scan_networks():
    raw = termux_api.wifi_scan()
    if not isinstance(raw, list):
        raise termux_api.ApiError("Unexpected scan format from Termux:API")
    best = {}
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        ap = from_raw(entry)
        old = best.get(ap.bssid)
        if old is None or (ap.rssi or -999) > (old.rssi or -999):
            best[ap.bssid] = ap
    return sorted(best.values(), key=lambda a: a.rssi if a.rssi is not None else -999,
                  reverse=True)


def do_scan(session, quiet=False):
    """Run a scan and store it in the session. quiet=True keeps stdout clean (for --json):
    messages then go to stderr."""
    def say(kind, msg):
        if quiet:
            print(msg, file=sys.stderr)
        else:
            {"ok": ok, "warn": warn, "err": err}[kind](msg)

    try:
        ctx = contextlib.nullcontext() if quiet else console.status(
            "[cyan]Asking Android for a WiFi scan...")
        with ctx:
            aps = scan_networks()
    except termux_api.ApiError as e:
        say("err", str(e))
        say("warn", "Run 'python main.py check' to diagnose permissions and setup.")
        return False
    if not aps:
        say("warn", "No networks returned. Check: WiFi ON, system Location ON, Location "
            "permission granted to Termux:API, and wait ~30s (Android throttles scans).")
        return False
    session.access_points = aps
    if all(a.ssid == "" and not a.hidden for a in aps):
        say("warn", "SSIDs are masked by Android: grant Location permission to Termux:API.")
    if all(a.capabilities is None for a in aps):
        say("warn", "Security types not reported by this Termux:API build (shown as Unknown).")
    say("ok", f"{len(aps)} access points found.")
    return True


def ensure_scan(session):
    if session.access_points:
        return True
    return do_scan(session)


def _sig_style(rssi):
    if rssi is None:
        return "dim"
    return "green" if rssi >= -60 else ("yellow" if rssi >= -75 else "red")


def _sec_style(label):
    if label in ("Open", "WEP", "WPA-PSK"):
        return "bold red"
    if label in ("WPA/WPA2 (mixed)", "WPA2/WPA3 (transition)", "OWE (Enhanced Open)"):
        return "yellow"
    if label.startswith("WPA3"):
        return "bold green"
    if label == "Unknown":
        return "dim"
    return "green"


def name_of(ap):
    return "(hidden)" if ap.hidden else (ap.ssid or "(masked)")


def render_table(aps):
    t = Table(title=f"WiFi networks ({len(aps)})", box=box.SIMPLE_HEAD,
              header_style="bold cyan")
    t.add_column("SSID", overflow="fold", max_width=16)
    t.add_column("dBm", justify="right")
    t.add_column("Ch", justify="right")
    t.add_column("Band", no_wrap=True)
    t.add_column("Security", overflow="fold")
    for ap in aps:
        t.add_row(Text(name_of(ap), style="bold" if not ap.hidden else "dim"),
                  Text(str(ap.rssi if ap.rssi is not None else "?"), style=_sig_style(ap.rssi)),
                  Text(str(ap.channel or "?")), Text(ap.band),
                  Text(ap.security + (" WPS" if ap.wps else ""), style=_sec_style(ap.security)))
    console.print(t)


def render_detailed(aps):
    for ap in aps:
        bar = "#" * (ap.signal_pct // 10) + "-" * (10 - ap.signal_pct // 10)
        console.print(Text(f"\n{name_of(ap)}", style="bold"), Text(f"[{bar}] {ap.signal_pct}%",
                      style=_sig_style(ap.rssi)))
        console.print(Text(f"  BSSID    {ap.bssid}"))
        console.print(Text(f"  Radio    ch {ap.channel or '?'} | {ap.frequency or '?'} MHz | "
                           f"{ap.band} | width {ap.width or '?'} MHz | {ap.rssi} dBm"))
        console.print(Text("  Security ", style="default") + Text(ap.security,
                      style=_sec_style(ap.security)) +
                      Text(f" | ciphers {','.join(ap.ciphers) or '?'} | WPS "
                           f"{'yes' if ap.wps else ('no' if ap.wps is False else '?')} | "
                           f"PMF {ap.pmf or '?'}"))


def render_channel_map(aps):
    counts = Counter((a.band, a.channel) for a in aps if a.channel)
    t = Table(title="Channel usage", box=box.SIMPLE_HEAD, header_style="bold cyan")
    t.add_column("Band")
    t.add_column("Ch", justify="right")
    t.add_column("APs")
    for (band, ch), n in sorted(counts.items(), key=lambda x: (x[0][0], x[0][1])):
        t.add_row(band, str(ch), Text("#" * n + f" {n}", style="red" if n >= 4 else "green"))
    console.print(t)


def show_connection(session, aps):
    try:
        conn = termux_api.wifi_connection()
    except termux_api.ApiError as e:
        err(str(e))
        return
    session.connection = conn
    rows = [(k, conn.get(k, "?")) for k in
            ("ssid", "bssid", "rssi", "link_speed_mbps", "frequency_mhz", "ip",
             "supplicant_state")]
    match = next((a for a in aps if a.bssid == str(conn.get("bssid", "")).lower()), None)
    if match:
        rows.append(("security", match.security))
    elif aps:
        rows.append(("security", "not found in last scan"))
    kv_table("Current connection", rows)


def run_menu(session):
    while True:
        c = menu("WiFi Scanner", [("1", "Scan now"), ("2", "Compact table"),
                                  ("3", "Detailed view"), ("4", "Channel map"),
                                  ("5", "Current connection")], back="Back")
        if c == "0":
            return
        if c == "1":
            if do_scan(session):
                render_table(session.access_points)
        elif c == "5":
            show_connection(session, session.access_points)
        elif not session.access_points:
            warn("No scan results yet. Run option 1 first.")
        elif c == "2":
            render_table(session.access_points)
        elif c == "3":
            render_detailed(session.access_points)
        elif c == "4":
            render_channel_map(session.access_points)
        pause()
