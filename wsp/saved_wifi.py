"""Saved WiFi password recovery for YOUR OWN device, official paths only.

Android does not let apps read saved WiFi passwords. This module therefore:
  * guides you through Android's own Share / QR screen (needs your PIN/fingerprint),
  * parses the 'WIFI:' text that QR code contains,
  * parses backup files that YOU supply (wpa_supplicant.conf, WifiConfigStore.xml),
  * can build a QR code to share your own network with guests.
It never reads protected system storage and never needs root.
Imported secrets live in memory only and are never written to reports.
"""
import os
import re
import xml.etree.ElementTree as ET

from rich import box
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .env import have, run
from .ui import ask, confirm, console, err, info, menu, ok, pause, warn

MAX_FILE = 5 * 1024 * 1024

GUIDE = (
    "Android's supported way to see a saved password (Android 10+):\n\n"
    "1. Settings > Network & internet (Samsung: Connections) > Wi-Fi\n"
    "2. Tap the gear / (i) next to the saved network\n"
    "3. Tap 'Share' (or 'QR code') and confirm with PIN / fingerprint\n"
    "4. Android shows a QR code, often with the password in plain text below it\n"
    "5. To import here: scan the QR with your camera app, copy the text that starts "
    "with WIFI: and use menu option 2 (or save a screenshot and use option 3).\n\n"
    "Only networks saved on this device can be shared, and only after you authenticate."
)

WHY = (
    "Saved networks are stored in protected system storage that only the Android system "
    "(and root) can read. Termux and Termux:API have no permission or API for it. This "
    "toolkit will not attempt to bypass that: no root tricks, no exploits, no ADB "
    "workarounds. Official routes: the Share/QR screen, your router's admin page, "
    "or backups you control."
)


# ---------- parsing ----------
def _split_unescaped(s, sep):
    parts, cur, i = [], [], 0
    while i < len(s):
        ch = s[i]
        if ch == "\\" and i + 1 < len(s):
            cur.append(s[i:i + 2])
            i += 2
            continue
        if ch == sep:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
        i += 1
    parts.append("".join(cur))
    return parts


def _unescape(v):
    return re.sub(r"\\(.)", r"\1", v)


def parse_wifi_uri(text):
    """Parse 'WIFI:T:WPA;S:name;P:pass;H:false;;' (the QR share format)."""
    text = text.strip()
    if not text.upper().startswith("WIFI:"):
        raise ValueError("Text does not start with WIFI:")
    fields = {}
    for part in _split_unescaped(text[5:], ";"):
        if not part:
            continue
        pieces = _split_unescaped(part, ":")
        fields[pieces[0].upper()] = ":".join(pieces[1:])
    ssid = _unescape(fields.get("S", ""))
    pw = _unescape(fields.get("P", ""))
    if len(ssid) >= 2 and ssid[0] == '"' and ssid[-1] == '"':
        ssid = ssid[1:-1]
    return {"ssid": ssid, "security": fields.get("T", "nopass") or "nopass",
            "secret": pw, "secret_type": "passphrase" if pw else "none",
            "hidden": fields.get("H", "false").lower() == "true", "source": "QR text"}


def _conf_field(block, name):
    m = re.search(rf'^\s*{name}\s*=\s*(?:"((?:[^"\\]|\\.)*)"|(\S+))', block, re.M)
    if not m:
        return None, False
    return (m.group(1), True) if m.group(1) is not None else (m.group(2), False)


def parse_wpa_supplicant(text):
    nets = []
    for m in re.finditer(r"network\s*=\s*\{(.*?)^\s*\}", text, re.S | re.M):
        blk = m.group(1)
        ssid, quoted = _conf_field(blk, "ssid")
        if ssid is None:
            continue
        if not quoted:
            try:
                ssid = bytes.fromhex(ssid).decode("utf-8", "replace")
            except ValueError:
                pass
        psk, psk_quoted = _conf_field(blk, "psk")
        sae, _ = _conf_field(blk, "sae_password")
        km, _ = _conf_field(blk, "key_mgmt")
        secret = sae or psk or ""
        stype = "none" if not secret else (
            "passphrase" if (sae or psk_quoted) else "psk-hash (64 hex, not reversible)")
        nets.append({"ssid": ssid, "security": km or "WPA-PSK", "secret": secret,
                     "secret_type": stype, "hidden": False, "source": "wpa_supplicant.conf"})
    return nets


def parse_wificonfigstore(path):
    root = ET.parse(path).getroot()
    nets = []
    for wc in root.iter("WifiConfiguration"):
        vals = {s.get("name"): (s.text or "") for s in wc.findall("string")}
        ssid = vals.get("SSID", "").strip('"')
        if not ssid:
            continue
        secret = vals.get("PreSharedKey", "").strip('"')
        key = vals.get("ConfigKey", "")
        sec = key.rsplit('"', 1)[-1] if '"' in key else "WPA_PSK"
        nets.append({"ssid": ssid, "security": sec or "WPA_PSK", "secret": secret,
                     "secret_type": "passphrase" if secret else "none",
                     "hidden": False, "source": "WifiConfigStore.xml"})
    return nets


def import_backup(path):
    path = os.path.expanduser(path.strip().strip('"'))
    if not os.path.isfile(path):
        raise ValueError("File not found")
    if os.path.getsize(path) > MAX_FILE:
        raise ValueError("File too large (limit 5 MB)")
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        head = fh.read(2048)
    if head.lstrip().startswith("<"):
        return parse_wificonfigstore(path)
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        return parse_wpa_supplicant(fh.read())


# ---------- QR helpers ----------
def _esc(v):
    return re.sub(r'([\\;,:"])', r"\\\1", v)


def make_wifi_uri(ssid, password, security="WPA", hidden=False):
    pw = "" if security == "nopass" else f"P:{_esc(password)};"
    return f"WIFI:T:{security};S:{_esc(ssid)};{pw}H:{'true' if hidden else 'false'};;"


def decode_qr_image(path):
    if not have("zbarimg"):
        raise ValueError("zbarimg missing. Install with: pkg install zbar")
    path = os.path.expanduser(path.strip().strip('"'))
    if not os.path.isfile(path):
        raise ValueError("File not found")
    rc, out, e = run(["zbarimg", "--quiet", "--raw", path], timeout=30)
    if rc != 0 or not out.strip():
        raise ValueError("No QR code found in image" + (f" ({e.strip()})" if e.strip() else ""))
    return out.strip().splitlines()[0]


# ---------- display ----------
def show_entries(entries, reveal=False):
    t = Table(title="Imported networks (memory only)", box=box.SIMPLE_HEAD,
              header_style="bold cyan")
    t.add_column("#", justify="right")
    t.add_column("SSID", overflow="fold")
    t.add_column("Security")
    t.add_column("Password", overflow="fold")
    for i, e in enumerate(entries, 1):
        if not e["secret"]:
            shown = Text("(none)", style="dim")
        elif reveal and e["secret_type"] == "passphrase":
            shown = Text(e["secret"], style="bold green")
        elif e["secret_type"].startswith("psk-hash"):
            shown = Text("hash only", style="yellow")
        else:
            shown = Text("********", style="dim")
        t.add_row(str(i), Text(e["ssid"]), Text(e["security"]), shown)
    console.print(t)


def reveal_flow(entries):
    if not entries:
        warn("Nothing imported yet.")
        return
    show_entries(entries)
    if confirm("Reveal passwords on screen? Only do this for your own networks"):
        show_entries(entries, reveal=True)
        pause()
        console.clear()
        ok("Screen cleared.")


def create_qr_flow():
    ssid = ask("Your network name (SSID):")
    if not ssid:
        return
    sec = ask("Security [WPA/nopass] (default WPA):", "WPA")
    if sec not in ("WPA", "nopass"):
        warn("Use WPA or nopass.")
        return
    pw = "" if sec == "nopass" else ask("Password:")
    uri = make_wifi_uri(ssid, pw, sec)
    if have("qrencode"):
        rc, out, _ = run(["qrencode", "-t", "ANSIUTF8", uri], timeout=10)
        if rc == 0:
            console.print(Text(out))
            info("Scan with the camera app to join. Clear the screen afterwards.")
            return
    warn("qrencode not installed (pkg install qrencode). The share text is:")
    console.print(Text(uri, style="bold"))


def run_menu(session):
    entries = []
    while True:
        c = menu("Saved WiFi (your own device)", [
            ("1", "How to view a saved password (Android Share/QR)"),
            ("2", "Import 'WIFI:' QR text"),
            ("3", "Decode a QR screenshot (needs zbar)"),
            ("4", "Import a backup file you own"),
            ("5", "Create a QR to share my network"),
            ("6", "Show / reveal imported entries"),
            ("7", "Why Android blocks direct access")], back="Back")
        if c == "0":
            return
        try:
            if c == "1":
                console.print(Panel(GUIDE, title="Official method", border_style="green"))
            elif c == "2":
                e = parse_wifi_uri(ask("Paste the WIFI:... text:"))
                entries.append(e)
                ok(f"Imported '{e['ssid']}'.")
            elif c == "3":
                e = parse_wifi_uri(decode_qr_image(ask("Path to QR image:")))
                entries.append(e)
                ok(f"Imported '{e['ssid']}'.")
            elif c == "4":
                info("Accepts wpa_supplicant.conf or WifiConfigStore.xml from a backup YOU made.")
                found = import_backup(ask("Path to backup file:"))
                entries.extend(found)
                ok(f"Imported {len(found)} network(s)." if found else "No networks found in file.")
            elif c == "5":
                create_qr_flow()
            elif c == "6":
                reveal_flow(entries)
            elif c == "7":
                console.print(Panel(WHY, title="Android limitation", border_style="yellow"))
        except (ValueError, ET.ParseError, OSError) as ex:
            err(str(ex))
        pause()
