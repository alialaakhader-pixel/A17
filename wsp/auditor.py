"""WiFi security auditor. Works only on passive scan data: no probing, no attacks."""
import re
from collections import defaultdict

from .models import SEV_ORDER, Finding
from .scanner import ensure_scan, name_of
from .ui import console, kv_table, menu, ok, pause, show_findings, warn

HARDENING = [
    ("Encryption", "Use WPA3-SAE if all devices support it, otherwise WPA2-PSK with AES/CCMP only. "
                   "Disable WEP, WPA1 and TKIP."),
    ("Passphrase", "Use a random passphrase of 16+ characters. Never keep the factory default."),
    ("WPS", "Disable WPS completely (at minimum the PIN method)."),
    ("PMF", "Enable Protected Management Frames (802.11w) as 'required' on WPA3, "
            "'optional/capable' on WPA2."),
    ("Admin access", "Change the router admin password, disable remote/WAN administration "
                     "and UPnP if unused."),
    ("Firmware", "Install router firmware updates; enable auto-update if offered."),
    ("Guest / IoT", "Put guests and IoT devices on a separate guest network with client isolation."),
    ("Channels", "On 2.4 GHz prefer channels 1, 6 or 11; move capable devices to 5 GHz."),
    ("Hidden SSID", "Hiding the SSID is not a security control. Do not rely on it."),
    ("DNS", "Use a trusted resolver and check the router's DNS settings were not altered."),
]


# Factory-style names ("WE_1A2B3C", "TP-LINK_9F3A", "Orange-1234"): a hint that the router still
# uses its out-of-the-box name and therefore probably its printed default password too.
DEFAULT_SSID = re.compile(
    r"^(?:TP-?LINK|D-?LINK|NETGEAR|LINKSYS|HUAWEI|ZTE|TENDA|ASUS|XIAOMI|MERCUSYS|"
    r"WE|TE-?DATA|ORANGE|VODAFONE|ETISALAT|STC|ZAIN)[-_ ][0-9A-F]{4,8}$", re.I)


def looks_default_ssid(ssid):
    return bool(ssid) and bool(DEFAULT_SSID.match(ssid))


def audit_access_points(aps, connected_bssid=None):
    out = []
    unknown = 0
    for ap in aps:
        target = name_of(ap) + f" [{ap.bssid}]"
        if connected_bssid and ap.bssid == connected_bssid:
            target += " (connected)"
        sec = ap.security

        def add(sev, title, detail, fix):
            out.append(Finding(sev, "wifi", title, detail, fix, target))

        if sec == "Unknown":
            unknown += 1
            continue
        if sec == "Open":
            add("HIGH", "Open network (no encryption)",
                "Traffic can be read by anyone in range, and users can be tricked "
                "onto look-alike networks.",
                "Enable WPA3/WPA2 on your own router. On public networks use a VPN and HTTPS only.")
        elif sec == "WEP":
            add("CRITICAL", "WEP encryption",
                "WEP is cryptographically broken and can be defeated in minutes.",
                "Switch the router to WPA2-AES or WPA3 immediately.")
        elif sec == "WPA-PSK":
            add("HIGH", "WPA (v1) only",
                "WPA1/TKIP is deprecated and has known weaknesses.",
                "Switch to WPA2-AES (CCMP) or WPA3.")
        elif sec == "WPA/WPA2 (mixed)":
            add("MEDIUM", "Mixed WPA/WPA2 mode",
                "Allowing legacy WPA1 weakens the network and allows downgrade.",
                "Set WPA2-only (AES) or WPA3.")
        elif sec == "WPA2-PSK":
            add("LOW", "WPA2-PSK (no WPA3)",
                "Secure with a strong passphrase, but captured handshakes can be attacked "
                "offline if the passphrase is weak.",
                "Use a 16+ character random passphrase; enable WPA3 if supported.")
        elif sec == "WPA2/WPA3 (transition)":
            add("LOW", "WPA2/WPA3 transition mode",
                "Clients may be downgraded to WPA2.",
                "Move to WPA3-only once all clients support it.")
        elif sec == "OWE (Enhanced Open)":
            add("INFO", "Enhanced Open (OWE)",
                "Traffic is encrypted but the network does not authenticate users.",
                "Fine for guest/public use; use WPA3-SAE for private networks.")
        elif sec == "WPA3-SAE":
            add("INFO", "WPA3-SAE", "Modern configuration.", "None required.")
        elif sec in ("WPA2/3-Enterprise", "WPA3-Enterprise"):
            add("INFO", "Enterprise (802.1X) network",
                "Per-user authentication. Safety depends on clients validating the RADIUS "
                "server certificate; this passive scan cannot check that.",
                "On managed devices, pin the CA / server name instead of 'trust on first use'.")

        if connected_bssid and ap.bssid == connected_bssid and looks_default_ssid(ap.ssid):
            add("LOW", "SSID looks like a factory default",
                f"'{ap.ssid}' follows an ISP/vendor default naming pattern, which often means "
                "the printed default WiFi and admin passwords were never changed.",
                "Change the WiFi passphrase and the router admin password (a custom SSID "
                "also makes look-alike networks easier to spot).")

        if "TKIP" in ap.ciphers and sec not in ("WPA-PSK", "WEP", "Open"):
            add("MEDIUM", "TKIP cipher enabled",
                "TKIP is deprecated and weaker than AES-CCMP.",
                "Select AES/CCMP only in the router's WiFi security settings.")
        if ap.wps:
            add("MEDIUM", "WPS advertised",
                "WPS is enabled. PIN-based WPS has known design flaws. This tool did not "
                "probe the router; it only saw the WPS flag in the beacon.",
                "Disable WPS in the router settings (at least the PIN method).")
        if ap.pmf == "none" and sec in ("WPA2-PSK", "WPA/WPA2 (mixed)"):
            add("LOW", "Protected Management Frames not advertised",
                "Without 802.11w, management frames can be spoofed (e.g. forced disconnects).",
                "Enable PMF (optional/required) if the router and clients support it.")
        if ap.hidden:
            add("LOW", "Hidden SSID",
                "Hidden networks still reveal their name when clients connect and can "
                "cause clients to leak the name when probing.",
                "Do not rely on hiding the SSID. Rely on strong encryption.")

    if unknown:
        out.append(Finding(
            "INFO", "wifi", "Security type not reported",
            f"{unknown} access point(s) came without a capabilities field, so their "
            "security could not be assessed. Nothing was assumed.",
            "Update termux-api / Termux:API app, or check the router's settings page.",
            "scan"))

    # Same SSID advertised with different security: misconfiguration or look-alike AP.
    by_ssid = defaultdict(set)
    for ap in aps:
        if ap.ssid and ap.security != "Unknown":
            by_ssid[ap.ssid].add(ap.security)
    for ssid, secs in by_ssid.items():
        if len(secs) > 1:
            out.append(Finding(
                "MEDIUM", "wifi", "Same SSID with different security settings",
                f"'{ssid}' is advertised as: {', '.join(sorted(secs))}. This can be a "
                "misconfigured mesh/extender or a look-alike (evil twin) access point.",
                "Verify every BSSID belongs to your equipment; align settings across APs.",
                ssid))

    # 2.4 GHz overlap
    g24 = [a for a in aps if a.band == "2.4 GHz" and a.channel]
    for ch in sorted({a.channel for a in g24}):
        near = [a for a in g24 if abs(a.channel - ch) < 5]
        if len(near) >= 5 and ch in (1, 6, 11):
            out.append(Finding(
                "LOW", "wifi", f"Crowded 2.4 GHz channel {ch}",
                f"{len(near)} access points overlap with channel {ch}.",
                "Move your router to a quieter channel or use 5 GHz.", f"channel {ch}"))
    out.sort(key=lambda f: SEV_ORDER.get(f.severity, 9))     # worst first, stable otherwise
    return out


def run_menu(session):
    while True:
        c = menu("WiFi Security Auditor", [("1", "Audit nearby networks"),
                                           ("2", "WPS exposure list"),
                                           ("3", "Router hardening checklist"),
                                           ("4", "Show last findings")], back="Back")
        if c == "0":
            return
        if c == "1":
            if ensure_scan(session):
                cb = str((session.connection or {}).get("bssid", "")).lower() or None
                findings = audit_access_points(session.access_points, cb)
                session.set_findings("wifi", findings)
                show_findings([f for f in findings if f.severity != "INFO"] or findings,
                              "WiFi audit")
                console.print(f"Overall grade: {session.risk_grade()}")
        elif c == "2":
            if ensure_scan(session):
                rows = [(name_of(a), "WPS flag present") for a in session.access_points if a.wps]
                if rows:
                    kv_table("Networks advertising WPS", rows)
                    warn("Flag only; the toolkit does not probe or attack WPS.")
                else:
                    ok("No scanned network advertised WPS (or capabilities unavailable).")
        elif c == "3":
            kv_table("Router hardening checklist (your own router)", HARDENING)
        elif c == "4":
            show_findings(session.findings.get("wifi", []), "Last WiFi findings")
        pause()
