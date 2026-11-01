from wsp import auditor, scanner
from wsp.sample_data import DEMO_SCAN


def aps(*entries):
    return [scanner.from_raw(e) for e in entries]


def titles(findings):
    return {f.title for f in findings}


def ap(ssid, caps, freq=2437, bssid="02:00:00:00:00:01"):
    return {"ssid": ssid, "bssid": bssid, "frequency_mhz": freq, "rssi": -50, "capabilities": caps}


def test_severity_mapping():
    f = auditor.audit_access_points(aps(ap("w", "[WEP][ESS]", bssid="02:00:00:00:00:0a"),
                                        ap("o", "[ESS]", bssid="02:00:00:00:00:0b")))
    sev = {x.target.split(" [")[0]: x.severity for x in f if x.category == "wifi"}
    assert sev["w"] == "CRITICAL" and sev["o"] == "HIGH"


def test_findings_sorted_worst_first():
    f = auditor.audit_access_points(aps(*DEMO_SCAN))
    order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
    ranks = [order[x.severity] for x in f]
    assert ranks == sorted(ranks)
    assert f[0].severity == "CRITICAL"


def test_unknown_security_assumes_nothing():
    f = auditor.audit_access_points(aps({"ssid": "x", "bssid": "a", "rssi": -50}))
    assert len(f) == 1 and f[0].severity == "INFO"
    assert "Nothing was assumed" in f[0].detail


def test_wpa3_only_has_no_warnings():
    f = auditor.audit_access_points(aps(ap("n", "[RSN-SAE-CCMP][ESS][MFPR]", 5180)))
    assert {x.severity for x in f} == {"INFO"}


def test_wps_is_flagged_from_beacon_only():
    f = auditor.audit_access_points(aps(ap("n", "[RSN-PSK-CCMP][ESS][WPS][MFPC]")))
    wps = [x for x in f if x.title == "WPS advertised"]
    assert wps and "did not probe" in wps[0].detail


def test_enterprise_is_info_only():
    f = auditor.audit_access_points(aps(ap("corp", "[WPA2-EAP-CCMP][RSN-EAP-CCMP][ESS][MFPC]")))
    assert titles(f) == {"Enterprise (802.1X) network"}


def test_same_ssid_different_security_flagged():
    f = auditor.audit_access_points(aps(
        ap("Cafe", "[RSN-SAE-CCMP][ESS]", bssid="02:00:00:00:00:01"),
        ap("Cafe", "[ESS]", bssid="02:00:00:00:00:02")))
    assert "Same SSID with different security settings" in titles(f)


def test_crowded_channel():
    many = [ap(f"n{i}", "[RSN-PSK-CCMP][ESS][MFPC]", 2412, f"02:00:00:00:01:{i:02x}")
            for i in range(5)]
    assert any(x.title == "Crowded 2.4 GHz channel 1"
               for x in auditor.audit_access_points(aps(*many)))


def test_default_ssid_only_flagged_for_connected_ap():
    entry = ap("WE_1A2B3C", "[RSN-PSK-CCMP][ESS][MFPC]", bssid="02:00:00:00:00:09")
    assert "SSID looks like a factory default" not in titles(auditor.audit_access_points(aps(entry)))
    f = auditor.audit_access_points(aps(entry), connected_bssid="02:00:00:00:00:09")
    assert "SSID looks like a factory default" in titles(f)


def test_looks_default_ssid():
    for yes in ("WE_1A2B3C", "TP-LINK_9F3A", "Orange-1234", "TP-Link 12AB"):
        assert auditor.looks_default_ssid(yes), yes
    for no in ("HomeNet", "WE", "WEOffice", "", None, "Orange"):
        assert not auditor.looks_default_ssid(no), no
