# Changelog

## 1.1.0
### Added
- `--demo` mode (synthetic scan data): try the toolkit on any computer, no Termux:API needed.
- `--json` output for `scan`, `audit`, `passwd` (clean stdout, messages go to stderr).
- `audit --fail-on SEVERITY` (exit code 2) and `audit --out DIR` for automation.
- `passwd` command: analyse a password (hidden prompt) or `--generate N`; `--wordlist FILE`.
- Auditor: Enterprise (802.1X) note, "factory-default SSID" hint for the connected network.
- Findings are now listed worst-first.
- Test-suite (111 tests) and GitHub Actions CI.

### Fixed
- `--redact` left full MAC addresses in the report topology and in diagnostics; redaction now
  covers every string in the report and the on-screen findings.
- Password analyzer rated degenerate strings such as 64 x `a` as "Strong".
- Reports are created with 0600 permissions atomically (no world-readable window) and never
  overwrite a report written in the same second.
- `check` no longer crashes if Termux:API returns a non-object entry in the scan list.

## 1.0.0
- Initial release.
