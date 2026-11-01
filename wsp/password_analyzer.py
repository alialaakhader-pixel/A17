"""Local password strength analysis. No network access, nothing is stored or logged."""
import getpass
import math
import os
import re
import secrets
import string

from rich.panel import Panel

from .ui import ask, console, kv_table, menu, ok, pause, warn

COMMON = {
    "password", "123456", "12345678", "123456789", "1234567890", "qwerty", "qwerty123",
    "abc123", "letmein", "welcome", "admin", "admin123", "iloveyou", "monkey", "dragon",
    "football", "baseball", "master", "sunshine", "princess", "login", "passw0rd",
    "password1", "123123", "111111", "000000", "654321", "1q2w3e4r", "1qaz2wsx",
    "qazwsx", "wifi", "wifi1234", "internet", "router", "homewifi", "guest", "guest123",
    "default", "changeme", "12341234", "00000000", "11111111", "87654321", "password123",
    "pass1234", "freedom", "whatever", "trustno1", "starwars", "superman", "batman",
    "hello", "hello123", "secret", "test1234", "computer", "soccer", "shadow", "mustang",
    "access", "qwertyuiop", "asdfghjkl", "zxcvbnm", "asdf1234", "mypassword", "wireless",
    "linksys", "netgear", "dlink", "tplink", "huawei", "vodafone", "family", "house",
}
WORDS = {w for w in COMMON if w.isalpha() and len(w) >= 4}
ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"]
LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t",
                      "@": "a", "$": "s", "!": "i"})
SYMBOLS = set(string.punctuation) | {" "}


def _class(c):
    return "d" if c.isdigit() else ("a" if c.isalpha() else "o")


def _sequence_chars(low):
    covered, i = set(), 0
    while i < len(low) - 2:
        a, b = low[i], low[i + 1]
        d = ord(b) - ord(a)
        if d in (1, -1) and _class(a) == _class(b) and _class(a) != "o":
            j = i + 1
            while (j + 1 < len(low) and ord(low[j + 1]) - ord(low[j]) == d
                   and _class(low[j + 1]) == _class(a)):
                j += 1
            if j - i + 1 >= 3:
                covered.update(range(i, j + 1))
            i = j
        else:
            i += 1
    return covered


def _keyboard_chars(low):
    covered = set()
    for row in ROWS + [r[::-1] for r in ROWS]:
        for i in range(len(low) - 3):
            if low[i:i + 4] in row:
                covered.update(range(i, i + 4))
    return covered


def _repeat_chars(pw):
    covered = set()
    for m in re.finditer(r"(.)\1{2,}", pw):
        covered.update(range(m.start(), m.end()))
    for m in re.finditer(r"(.{2,4})\1+", pw):
        covered.update(range(m.start(), m.end()))
    return covered


def in_wordlist(pw, path):
    """Stream a local wordlist file (e.g. your own leaked-password list)."""
    path = os.path.expanduser(path)
    target = pw.lower()
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            if line.strip().lower() == target:
                return True
    return False


def humanize(seconds):
    if seconds < 1:
        return "instantly"
    for unit, size in (("years", 31557600), ("days", 86400), ("hours", 3600),
                       ("minutes", 60), ("seconds", 1)):
        if seconds >= size:
            n = seconds / size
            if unit == "years" and n > 1e9:
                return "billions of years+"
            return f"{n:,.0f} {unit}"
    return "instantly"


def analyze(pw, wordlist=None):
    n = len(pw)
    pool = 0
    if re.search(r"[a-z]", pw):
        pool += 26
    if re.search(r"[A-Z]", pw):
        pool += 26
    if re.search(r"\d", pw):
        pool += 10
    if any(c in SYMBOLS for c in pw):
        pool += 33
    if any(ord(c) > 127 for c in pw):
        pool += 100
    per_char = math.log2(pool) if pool else 0
    naive = n * per_char

    issues, covered = [], set()
    low = pw.lower()
    norm = low.translate(LEET)

    seq = _sequence_chars(low)
    if seq:
        issues.append("Sequential characters (abc, 123, 987...)")
        covered |= seq
    kb = _keyboard_chars(low)
    if kb:
        issues.append("Keyboard pattern (qwer, asdf, 1234...)")
        covered |= kb
    rep = _repeat_chars(pw)
    if rep:
        issues.append("Repeated characters or blocks")
        covered |= rep
    if re.search(r"(?:19|20)\d{2}", pw):
        issues.append("Contains a year (very common in passwords)")
    wordish = bool(re.fullmatch(r"[A-Z]?[a-z]{3,12}\d{1,4}[!@#$%^&*.?]?", pw))
    if wordish:
        issues.append("Word + digits pattern (e.g. Summer2024!)")
    few_distinct = bool(n) and len(set(pw)) <= max(2, n // 4)
    if few_distinct:
        issues.append("Very few distinct characters")
    if pw.isdigit():
        issues.append("Digits only")
    elif pw.isalpha():
        issues.append("Letters only")

    stripped = re.sub(r"[^a-z]", "", norm)
    hits = [w for w in WORDS if w in stripped]
    dict_chars = max((len(w) for w in hits), default=0)
    if hits:
        issues.append("Contains a very common word: " + ", ".join(sorted(hits)[:3]))

    eff_len = max(0.0, n - 0.8 * len(covered) - 0.8 * dict_chars)
    bits = eff_len * per_char
    if wordish:
        bits = min(bits, 30)   # dictionary word + digits(+symbol) falls to rule-based attacks
    if few_distinct:           # e.g. 64 x 'a': length alone must not make it look strong
        bits = min(bits, len(set(pw)) * per_char + 2 * math.log2(n + 1))
    exact = low in COMMON or norm in COMMON
    listed = False
    if wordlist:
        try:
            listed = in_wordlist(pw, wordlist)
        except OSError as e:
            warn(f"Could not read wordlist: {e}")
    if exact or listed:
        bits = min(bits, 12)
        issues.insert(0, "Found in a common/leaked password list" if listed
                      else "Is a very common password")

    if n < 8:
        rating = "Invalid for WPA2/WPA3 (needs 8-63 chars)"
    elif n > 63 and not re.fullmatch(r"[0-9a-fA-F]{64}", pw):
        rating = "Invalid for WPA2/WPA3 (max 63 chars)"
    elif bits < 28:
        rating = "Very weak"
    elif bits < 36:
        rating = "Weak"
    elif bits < 60:
        rating = "Fair"
    elif bits < 80:
        rating = "Strong"
    else:
        rating = "Very strong"

    recs = []
    if n < 16:
        recs.append("Use at least 16 characters for a WiFi passphrase.")
    if issues:
        recs.append("Avoid words, years, sequences and keyboard patterns.")
    if pool < 62:
        recs.append("Mix upper/lower case and digits (or use a long random passphrase).")
    recs.append("Generate it randomly (menu option 2) and store it in a password manager.")

    seconds = (2 ** max(bits - 1, 0))
    return {"length": n, "pool": pool, "naive_bits": round(naive, 1),
            "effective_bits": round(bits, 1), "rating": rating, "issues": issues,
            "recommendations": recs,
            "time_wpa2_gpu_rig": humanize(seconds / 1e7),
            "time_fast_hash": humanize(seconds / 1e11)}


def generate_password(length=20, symbols=True):
    length = max(12, min(int(length), 63))
    alphabet = string.ascii_letters + string.digits + ("!@#$%^&*-_=+?" if symbols else "")
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in pw) and any(c.isupper() for c in pw)
                and any(c.isdigit() for c in pw)
                and (not symbols or any(c in "!@#$%^&*-_=+?" for c in pw))):
            return pw


def show_analysis(res):
    style = {"Very weak": "red", "Weak": "red", "Fair": "yellow",
             "Strong": "green", "Very strong": "bold green"}.get(res["rating"], "red")
    kv_table("Password analysis (local only)", [
        ("Length", res["length"]),
        ("Character pool", res["pool"]),
        ("Naive entropy", f"{res['naive_bits']} bits"),
        ("Effective entropy", f"{res['effective_bits']} bits (estimate)"),
        ("Offline attack, WPA2 GPU rig (~1e7/s)", res["time_wpa2_gpu_rig"]),
        ("Offline attack, fast hash (~1e11/s)", res["time_fast_hash"]),
    ])
    console.print(Panel(res["rating"], title="Rating", style=style, expand=False))
    if res["issues"]:
        console.print("[bold]Weak patterns[/]")
        for i in res["issues"]:
            console.print(f"  - {i}", markup=False)
    console.print("Note: entropy is an estimate that assumes random choices. Words outside the "
                  "small built-in list are not detected; pass a wordlist for stronger checks.",
                  style="dim", markup=False)
    console.print("[bold]Recommendations[/]")
    for r in res["recommendations"]:
        console.print(f"  - {r}", markup=False)


def run_menu(session):
    while True:
        c = menu("Password Security Analyzer", [
            ("1", "Analyze a password (hidden input)"),
            ("2", "Generate a strong random password"),
            ("3", "Tips for WiFi passphrases")], back="Back")
        if c == "0":
            return
        if c == "1":
            ok("Input is hidden, processed locally, never saved or sent.")
            pw = getpass.getpass("Password: ")
            if not pw:
                warn("Empty input.")
            else:
                wl = ask("Optional local wordlist path (Enter to skip):")
                show_analysis(analyze(pw, wl or None))
            del pw
        elif c == "2":
            n = ask("Length [20]:", "20")
            try:
                pw = generate_password(int(n))
                console.print(f"\n  {pw}\n", markup=False, style="bold green")
                show_analysis(analyze(pw))
            except ValueError:
                warn("Enter a number.")
        elif c == "3":
            kv_table("WiFi passphrase tips", [
                ("Length", "16+ random characters beats complexity rules."),
                ("Uniqueness", "Never reuse it for other accounts."),
                ("Defaults", "Change the router's printed default password."),
                ("Sharing", "Give guests a separate guest-network password."),
                ("Rotation", "Change it if a device is lost or someone untrusted had it.")])
        pause()
