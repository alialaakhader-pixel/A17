# WiFi Security Pro Ultimate

A defensive WiFi auditing toolkit for **Android Termux** (Python 3, one dependency: `rich`).
It audits networks you own or are authorized to test. It contains **no** cracking, deauth,
handshake capture, WPS attacks, or credential extraction.

## Modules
| Menu | Module | What it does |
|---|---|---|
| 1 | `wsp/scanner.py` | Passive scan via Termux:API: SSID, BSSID, dBm, channel, frequency, band, width, WPA/WPA2/WPA3/Open/WEP, WPS flag, hidden APs |
| 2 | `wsp/saved_wifi.py` | Official routes to your own saved passwords: Android Share/QR guide, `WIFI:` QR text import, QR screenshot decode (zbar), backup file import, QR creator |
| 3 | `wsp/password_analyzer.py` | Local entropy, pattern detection, crack-time estimates, generator (hidden input, nothing stored) |
| 4 | `wsp/auditor.py` | Findings with severity, router hardening checklist, WPS exposure (flag only), evil-twin hint, channel crowding |
| 5 | `wsp/discovery.py` | Device discovery, TCP port scan, topology. Private IPs only + typed `AUTHORIZED` confirmation |
| 6 | `wsp/diagnostics.py` | Ping (ICMP or TCP fallback), DNS resolver tests, gateway, interfaces, quality score |
| 7 | `wsp/reports.py` | JSON + TXT reports, severity ratings, optional MAC redaction |
| 8 | `wsp/env.py` | Environment, permission and limitation checks |

## Quick start / بداية سريعة
```bash
pip install -r requirements.txt
python main.py audit --demo          # try it with synthetic data, no phone needed
python main.py                       # interactive menu (on Android/Termux)
```
**بالعربي:** الأداة دفاعية فقط لفحص شبكات الواي فاي بتاعتك (أو اللي معاك إذن تفحصها). مفيش فيها كسر باسوردات ولا هجمات.
جرّبها الأول بالأمر `python main.py audit --demo` على أي جهاز، وعلى الموبايل شغّلها من Termux بعد ما تثبّت `termux-api`.

## Install (Termux)
1. Install **Termux** and the **Termux:API app** from the same source (F-Droid recommended). Open Termux:API once.
2. Copy the zip into Termux and unpack:
   ```bash
   termux-setup-storage                      # allow storage access
   pkg install -y unzip
   cp ~/storage/downloads/wifi_security_pro.zip ~/
   unzip wifi_security_pro.zip && cd wifi_security_pro
   ```
3. Run the installer:
   ```bash
   bash install.sh
   ```
4. Android Settings > Apps > Termux:API > Permissions: allow **Location** (and **Nearby devices** if shown). Turn system **Location ON** and WiFi ON.

## Run
```bash
python main.py            # interactive menu
python main.py check      # diagnose setup/permissions
python main.py scan       # one-shot scan
python main.py audit --save --redact   # scan + audit + save JSON/TXT (MACs redacted)
python main.py audit --json --fail-on HIGH   # JSON on stdout, exit code 2 if HIGH+ found
python main.py passwd                 # analyse a password (hidden prompt, local only)
python main.py passwd --generate 24   # generate + analyse a random passphrase
python main.py audit --demo           # any command with synthetic data (no Android needed)
```

## Tests
```bash
pip install -r requirements-dev.txt
python -m pytest
```
Reports go to `~/storage/shared/WiFiSecurityPro` if available, else `~/wsp_reports` (override with `WSP_REPORT_DIR`).

## Android / hardware limits (honest version)
- **Saved passwords:** Android does not expose them to apps. Use Settings > Wi-Fi > (gear) > Share (PIN/fingerprint), then import the `WIFI:` text (menu 2). The toolkit never uses root or touches protected storage.
- **Scan throttling:** about 4 scans / 2 min on Android 9+. Results may be cached.
- **Security types** come from the `capabilities` field of Termux:API. If your build omits it, security shows `Unknown` (nothing is guessed).
- **No monitor mode / packet capture** on stock phones, so none is attempted.
- **MAC/ARP data** is hidden from apps on newer Android; blanks mean "not available".

## Troubleshooting
| Symptom | Fix |
|---|---|
| `Termux:API did not answer` | Install the Termux:API app (same source as Termux), open it once, `pkg install termux-api` |
| Empty scan / SSIDs masked | Grant Location to Termux:API, turn Location ON, wait 30-60 s |
| Security shows `Unknown` | `pkg upgrade termux-api` and update the Termux:API app |
| `pip install` fails | `pkg install python-pip` then `pip install rich` |
| No MAC addresses | Android privacy restriction; IPs still work |
| Ping uses "tcp-connect" | `pkg install inetutils` for ICMP (optional) |
| Gateway "ASSUMED" | Android hid the routing table; verify manually |
| Reports not in Downloads | Run `termux-setup-storage`, then check `~/storage/shared/WiFiSecurityPro` |

## Legal
Use only on networks and devices you own or have written permission to test.
