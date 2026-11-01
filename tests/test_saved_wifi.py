import pytest

from wsp import saved_wifi as sw


def test_parse_basic_uri():
    e = sw.parse_wifi_uri("WIFI:T:WPA;S:Home;P:secret123;H:false;;")
    assert (e["ssid"], e["security"], e["secret"], e["hidden"]) == ("Home", "WPA", "secret123", False)
    assert e["secret_type"] == "passphrase"


def test_uri_roundtrip_with_special_characters():
    ssid, pw = 'My;Net:"1"', r'pa:ss;wo\rd,"x"'
    e = sw.parse_wifi_uri(sw.make_wifi_uri(ssid, pw, "WPA", hidden=True))
    assert e["ssid"] == ssid and e["secret"] == pw and e["hidden"] is True


def test_open_network_uri():
    e = sw.parse_wifi_uri(sw.make_wifi_uri("Cafe", "", "nopass"))
    assert e["secret"] == "" and e["secret_type"] == "none"


def test_uri_must_start_with_wifi():
    with pytest.raises(ValueError):
        sw.parse_wifi_uri("https://example.com")


WPA_CONF = '''
ctrl_interface=/var/run/wpa_supplicant
network={
    ssid="Home"
    psk="secretpass"
    key_mgmt=WPA-PSK
}
network={
    ssid=486f6d6532
    psk=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
}
network={
    ssid="Open"
    key_mgmt=NONE
}
'''


def test_parse_wpa_supplicant():
    nets = sw.parse_wpa_supplicant(WPA_CONF)
    assert [n["ssid"] for n in nets] == ["Home", "Home2", "Open"]
    assert nets[0]["secret"] == "secretpass" and nets[0]["secret_type"] == "passphrase"
    assert nets[1]["secret_type"].startswith("psk-hash")        # not reversible, labelled as such
    assert nets[2]["secret"] == "" and nets[2]["secret_type"] == "none"


XML = '''<?xml version='1.0'?>
<WifiConfigStoreData><NetworkList><Network><WifiConfiguration>
<string name="ConfigKey">&quot;Home&quot;WPA_PSK</string>
<string name="SSID">&quot;Home&quot;</string>
<string name="PreSharedKey">&quot;secret123&quot;</string>
</WifiConfiguration></Network></NetworkList></WifiConfigStoreData>'''


def test_import_backup_xml_and_conf(tmp_path):
    x = tmp_path / "WifiConfigStore.xml"
    x.write_text(XML, encoding="utf-8")
    n = sw.import_backup(str(x))
    assert n[0]["ssid"] == "Home" and n[0]["secret"] == "secret123" and n[0]["security"] == "WPA_PSK"
    c = tmp_path / "wpa_supplicant.conf"
    c.write_text(WPA_CONF, encoding="utf-8")
    assert len(sw.import_backup(str(c))) == 3


def test_import_backup_limits(tmp_path):
    with pytest.raises(ValueError):
        sw.import_backup(str(tmp_path / "missing"))
    big = tmp_path / "big"
    big.write_bytes(b"x" * (sw.MAX_FILE + 1))
    with pytest.raises(ValueError):
        sw.import_backup(str(big))


def test_decode_qr_reports_missing_zbar(monkeypatch):
    monkeypatch.setattr(sw, "have", lambda c: False)
    with pytest.raises(ValueError, match="zbarimg missing"):
        sw.decode_qr_image("x.png")
