import string

import pytest

from wsp import password_analyzer as pa


@pytest.mark.parametrize("pw", ["password", "12345678", "qwerty123", "Password1", "admin123"])
def test_common_passwords_are_weak(pw):
    assert pa.analyze(pw)["rating"] in ("Very weak", "Weak")


def test_short_is_invalid_for_wpa():
    assert pa.analyze("abc123")["rating"].startswith("Invalid")


def test_too_long_is_invalid_but_64_hex_psk_allowed():
    assert pa.analyze("g" * 64)["rating"].startswith("Invalid")     # 'g' is not hex
    assert not pa.analyze("0123456789abcdef" * 4)["rating"].startswith("Invalid")


def test_long_random_is_strong():
    pw = pa.generate_password(24)
    assert pa.analyze(pw)["rating"] in ("Strong", "Very strong")


def test_patterns_detected():
    issues = " ".join(pa.analyze("abcd1234qwer")["issues"])
    assert "Sequential" in issues and "Keyboard" in issues
    assert any("year" in i for i in pa.analyze("Mohamed2024xyz")["issues"])
    assert any("Repeated" in i for i in pa.analyze("aaaaabbbbb11")["issues"])


def test_leet_speak_does_not_hide_common_word():
    assert any("common word" in i or "common password" in i for i in pa.analyze("P@ssw0rd")["issues"])


def test_wordlist_lookup(tmp_path):
    wl = tmp_path / "wl.txt"
    wl.write_text("hunter2xyz\nSomeLeakedOne\n", encoding="utf-8")
    assert pa.analyze("someleakedone", str(wl))["issues"][0].startswith("Found in a common/leaked")
    assert pa.in_wordlist("hunter2xyz", str(wl)) and not pa.in_wordlist("nope", str(wl))


def test_generator_properties():
    for n in (12, 20, 63):
        pw = pa.generate_password(n)
        assert len(pw) == n
        assert any(c.islower() for c in pw) and any(c.isupper() for c in pw)
        assert any(c.isdigit() for c in pw) and any(c in "!@#$%^&*-_=+?" for c in pw)
    assert len(pa.generate_password(5)) == 12 and len(pa.generate_password(500)) == 63
    assert set(pa.generate_password(30, symbols=False)) <= set(string.ascii_letters + string.digits)


def test_generator_is_not_constant():
    assert len({pa.generate_password(20) for _ in range(20)}) == 20


def test_humanize():
    assert pa.humanize(0.2) == "instantly"
    assert pa.humanize(90) == "2 minutes"
    assert pa.humanize(1e20) == "billions of years+"


def test_degenerate_long_strings_are_not_strong():
    # valid 64-hex PSK format, but a single repeated character is trivially guessable
    for pw in ("a" * 64, "ab" * 32, "1" * 20):
        assert pa.analyze(pw)["rating"] in ("Very weak", "Weak"), pw
