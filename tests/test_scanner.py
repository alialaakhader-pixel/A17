import pytest

from wsp import scanner
from wsp.scanner import band_of, freq_to_channel, from_raw, parse_security


@pytest.mark.parametrize("freq,ch", [(2412, 1), (2437, 6), (2462, 11), (2472, 13), (2484, 14),
                                     (5180, 36), (5745, 149), (5955, 1), (None, None), (900, None)])
def test_freq_to_channel(freq, ch):
    assert freq_to_channel(freq) == ch


def test_band_of():
    assert band_of(2437) == "2.4 GHz"
    assert band_of(5180) == "5 GHz"
    assert band_of(5975) == "6 GHz"
    assert band_of(None) == "?"


@pytest.mark.parametrize("caps,label", [
    ("[WPA3-SAE-CCMP][RSN-SAE-CCMP][ESS]", "WPA3-SAE"),
    ("[WPA2-PSK-CCMP][RSN-PSK+SAE-CCMP][ESS]", "WPA2/WPA3 (transition)"),
    ("[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]", "WPA2-PSK"),
    ("[WPA-PSK-TKIP][WPA2-PSK-CCMP+TKIP][ESS]", "WPA/WPA2 (mixed)"),
    ("[WPA-PSK-TKIP][ESS]", "WPA-PSK"),
    ("[WEP][ESS]", "WEP"),
    ("[ESS]", "Open"),
    ("[RSN-OWE-CCMP][ESS]", "OWE (Enhanced Open)"),
    ("[WPA2-EAP-CCMP][RSN-EAP-CCMP][ESS]", "WPA2/3-Enterprise"),
    ("", "Unknown"),
])
def test_parse_security_labels(caps, label):
    assert parse_security(caps)["label"] == label


def test_parse_security_missing_caps_is_unknown_not_guessed():
    r = parse_security(None)
    assert r["label"] == "Unknown" and r["wps"] is None and r["pmf"] is None


def test_parse_security_flags():
    r = parse_security("[WPA2-PSK-CCMP+TKIP][ESS][WPS][MFPC]")
    assert r["wps"] is True
    assert r["pmf"] == "capable"
    assert r["ciphers"] == ["TKIP", "CCMP"]
    assert parse_security("[RSN-SAE-CCMP][MFPR]")["pmf"] == "required"
    assert parse_security("[WPA2-PSK-CCMP]")["pmf"] == "none"


def test_from_raw_hidden_vs_masked():
    hidden = from_raw({"ssid": "", "bssid": "AA:BB:CC:DD:EE:FF", "frequency_mhz": 2412,
                       "rssi": -60, "capabilities": "[ESS]"})
    masked = from_raw({"ssid": "<unknown ssid>", "bssid": "aa:bb:cc:dd:ee:00"})
    assert hidden.hidden and hidden.ssid == ""
    assert not masked.hidden
    assert hidden.bssid == "aa:bb:cc:dd:ee:ff"           # normalised to lower case


def test_signal_pct_bounds():
    ap = from_raw({"ssid": "x", "bssid": "a", "rssi": -30})
    assert ap.signal_pct == 100
    ap.rssi = -120
    assert ap.signal_pct == 0
    ap.rssi = None
    assert ap.signal_pct == 0


def test_scan_networks_dedupes_by_bssid_keeping_strongest(monkeypatch):
    raw = [{"ssid": "A", "bssid": "aa:aa:aa:aa:aa:aa", "rssi": -80},
           {"ssid": "A", "bssid": "aa:aa:aa:aa:aa:aa", "rssi": -50},
           {"ssid": "B", "bssid": "bb:bb:bb:bb:bb:bb", "rssi": -60}, "junk"]
    monkeypatch.setattr(scanner.termux_api, "wifi_scan", lambda: raw)
    aps = scanner.scan_networks()
    assert [a.ssid for a in aps] == ["A", "B"] and aps[0].rssi == -50


def test_scan_networks_rejects_unexpected_shape(monkeypatch):
    monkeypatch.setattr(scanner.termux_api, "wifi_scan", lambda: {"oops": 1})
    with pytest.raises(scanner.termux_api.ApiError):
        scanner.scan_networks()


def test_demo_scan(demo):
    aps = scanner.scan_networks()
    assert len(aps) == 13
    assert aps[0].rssi >= aps[-1].rssi                    # sorted strongest first
