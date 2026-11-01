#!/data/data/com.termux/files/usr/bin/bash
# WiFi Security Pro Ultimate - Termux installer
set -u
cd "$(dirname "$0")"

say()  { printf '\033[1;36m[*]\033[0m %s\n' "$1"; }
good() { printf '\033[1;32m[+]\033[0m %s\n' "$1"; }
bad()  { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }

case "${PREFIX:-}" in
  *com.termux*) good "Termux detected" ;;
  *) bad "Not Termux. Continuing, but Android features will not work." ;;
esac

# Required packages
if command -v pkg >/dev/null 2>&1; then
  say "Updating package lists..."
  pkg update -y >/dev/null 2>&1 || bad "pkg update failed (check internet / mirror: termux-change-repo)"
  for p in python termux-api; do
    if pkg install -y "$p" >/dev/null 2>&1; then good "Installed/OK: $p"
    else bad "FAILED required package: $p"; fi
  done
  # Optional packages (the toolkit has fallbacks)
  for p in iproute2 inetutils qrencode zbar; do
    if pkg install -y "$p" >/dev/null 2>&1; then good "Optional OK: $p"
    else bad "Optional package not installed: $p (fallbacks will be used)"; fi
  done
fi

say "Installing Python dependencies..."
python -m pip install -r requirements.txt || { bad "pip failed. Try: pkg install python-pip"; exit 1; }

chmod +x main.py install.sh 2>/dev/null

say "Testing Termux:API app..."
if command -v termux-wifi-connectioninfo >/dev/null 2>&1; then
  if timeout 10 termux-wifi-connectioninfo >/dev/null 2>&1; then good "Termux:API app responds"
  else bad "No answer. Install the Termux:API *app* (same source as Termux) and open it once."; fi
else
  bad "termux-api package missing"
fi

cat <<'MSG'

Permissions checklist (Android Settings > Apps > Termux:API > Permissions):
  - Location: allow (Android requires it to read WiFi scan results)
  - Nearby devices: allow, if offered
  - System Location switch: ON
Optional: run 'termux-setup-storage' to save reports to shared storage.

Done. Start with:   python main.py check
Then:               python main.py
MSG
