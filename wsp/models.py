"""Shared data models: findings and the in-memory session."""
from dataclasses import dataclass, field
from datetime import datetime

SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3, "INFO": 4}
_GRADE = {"CRITICAL": "F", "HIGH": "D", "MEDIUM": "C", "LOW": "B"}


@dataclass
class Finding:
    severity: str          # CRITICAL | HIGH | MEDIUM | LOW | INFO
    category: str          # wifi | discovery | diagnostics
    title: str
    detail: str
    recommendation: str
    target: str = ""


@dataclass
class Session:
    """Everything collected during one run. Held in memory only.

    Saved WiFi passwords are deliberately NOT part of the session, so they can
    never end up in a report.
    """
    started: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    access_points: list = field(default_factory=list)
    connection: dict = None
    findings: dict = field(default_factory=dict)
    network: dict = None
    hosts: list = field(default_factory=list)
    diagnostics: dict = field(default_factory=dict)
    authorized_scopes: list = field(default_factory=list)

    def set_findings(self, category, items):
        self.findings[category] = list(items)

    def all_findings(self):
        flat = [f for items in self.findings.values() for f in items]
        return sorted(flat, key=lambda f: SEV_ORDER.get(f.severity, 9))

    def risk_grade(self):
        if not self.findings:
            return "N/A"
        present = {f.severity for f in self.all_findings()}
        for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            if sev in present:
                return _GRADE[sev]
        return "A"
