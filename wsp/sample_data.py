"""Synthetic Termux:API data for --demo mode and the test-suite.

Everything here is invented (locally-administered MACs, made-up SSIDs). It lets you try the
toolkit on a PC, in CI, or before granting any Android permission. Demo output is always
labelled as such by the CLI so it can never be mistaken for a real scan.
"""

DEMO_SCAN = [
    {"ssid": "HomeNet", "bssid": "02:00:00:aa:00:01", "frequency_mhz": 5180, "rssi": -48,
     "channel_bandwidth_mhz": 80, "capabilities": "[WPA3-SAE-CCMP][RSN-SAE-CCMP][ESS][MFPR]"},
    {"ssid": "HomeNet", "bssid": "02:00:00:aa:00:02", "frequency_mhz": 2437, "rssi": -52,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS][WPS]"},
    {"ssid": "CafeGuest", "bssid": "02:00:00:bb:00:01", "frequency_mhz": 2412, "rssi": -63,
     "channel_bandwidth_mhz": 20, "capabilities": "[ESS]"},
    {"ssid": "OldRouter", "bssid": "02:00:00:cc:00:01", "frequency_mhz": 2462, "rssi": -70,
     "channel_bandwidth_mhz": 20, "capabilities": "[WEP][ESS]"},
    {"ssid": "WE_1A2B3C", "bssid": "02:00:00:dd:00:01", "frequency_mhz": 2437, "rssi": -66,
     "channel_bandwidth_mhz": 20,
     "capabilities": "[WPA-PSK-TKIP][WPA2-PSK-CCMP+TKIP][ESS][WPS]"},
    {"ssid": "Office", "bssid": "02:00:00:ee:00:01", "frequency_mhz": 5240, "rssi": -58,
     "channel_bandwidth_mhz": 40, "capabilities": "[WPA2-EAP-CCMP][RSN-EAP-CCMP][ESS][MFPC]"},
    {"ssid": "Neighbour5G", "bssid": "02:00:00:ff:00:01", "frequency_mhz": 5745, "rssi": -81,
     "channel_bandwidth_mhz": 80, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS][MFPC]"},
    {"ssid": "", "bssid": "02:00:00:11:00:01", "frequency_mhz": 2412, "rssi": -77,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"},
    {"ssid": "Transition", "bssid": "02:00:00:22:00:01", "frequency_mhz": 5200, "rssi": -69,
     "channel_bandwidth_mhz": 80, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK+SAE-CCMP][ESS][MFPC]"},
    {"ssid": "Crowded1", "bssid": "02:00:00:33:00:01", "frequency_mhz": 2412, "rssi": -72,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"},
    {"ssid": "Crowded2", "bssid": "02:00:00:33:00:02", "frequency_mhz": 2412, "rssi": -74,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"},
    {"ssid": "Crowded3", "bssid": "02:00:00:33:00:03", "frequency_mhz": 2417, "rssi": -76,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"},
    {"ssid": "Crowded4", "bssid": "02:00:00:33:00:04", "frequency_mhz": 2412, "rssi": -79,
     "channel_bandwidth_mhz": 20, "capabilities": "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"},
]

DEMO_CONNECTION = {
    "ssid": "HomeNet", "bssid": "02:00:00:aa:00:02", "rssi": -52, "link_speed_mbps": 144,
    "frequency_mhz": 2437, "ip": "192.168.1.23", "supplicant_state": "COMPLETED",
}
