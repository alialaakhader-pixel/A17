"""Terminal UI helpers built on `rich`. Narrow-screen (phone) friendly."""
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import (BarColumn, Progress, SpinnerColumn,
                           TaskProgressColumn, TextColumn, TimeElapsedColumn)
from rich.prompt import Prompt
from rich.table import Table
from rich.text import Text

from . import APP_NAME, __version__

console = Console()

LOGO = r"""
 __      __ ___  ___  ___
 \ \    / /|_ _|| __||_ _|
  \ \/\/ /  | | | _|  | |
   \_/\_/  |___||_|  |___|
"""

SEV_STYLE = {
    "CRITICAL": "bold white on red",
    "HIGH": "bold red",
    "MEDIUM": "bold yellow",
    "LOW": "cyan",
    "INFO": "dim",
}


def banner():
    console.print(LOGO, style="bold cyan", markup=False, highlight=False)
    console.print(Panel.fit(
        f"[bold]{APP_NAME}[/] v{__version__}\n"
        "[dim]Defensive WiFi auditing for Android Termux[/]",
        border_style="cyan"))


def info(msg):
    console.print(Text(f"i  {msg}", style="cyan"))


def ok(msg):
    console.print(Text(f"+  {msg}", style="green"))


def warn(msg):
    console.print(Text(f"!  {msg}", style="yellow"))


def err(msg):
    console.print(Text(f"x  {msg}", style="bold red"))


def ask(prompt, default=""):
    value = console.input(Text(f"{prompt} ", style="bold green")).strip()
    return value or default


def confirm(prompt, default=False):
    suffix = "Y/n" if default else "y/N"
    value = ask(f"{prompt} ({suffix})").lower()
    if not value:
        return default
    return value in ("y", "yes")


def pause():
    console.input(Text("\nPress Enter to continue...", style="dim"))


def menu(title, options, back="Back / Exit"):
    table = Table(title=title, box=box.ROUNDED, show_header=False,
                  border_style="cyan", title_style="bold")
    table.add_column(style="bold yellow", width=3, justify="right")
    table.add_column()
    for key, label in options:
        table.add_row(key, label)
    table.add_row("0", back)
    console.print(table)
    choices = [k for k, _ in options] + ["0"]
    return Prompt.ask("[bold green]Select[/]", choices=choices, show_choices=False)


def kv_table(title, rows):
    table = Table(title=title, box=box.SIMPLE_HEAD, show_header=False, title_style="bold")
    table.add_column(style="cyan", no_wrap=True)
    table.add_column(overflow="fold")
    for key, value in rows:
        table.add_row(Text(str(key)), Text(str(value)))
    console.print(table)


def sev_text(sev):
    return Text(f" {sev} ", style=SEV_STYLE.get(sev, ""))


def progress():
    return Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"),
                    BarColumn(), TaskProgressColumn(), TimeElapsedColumn(),
                    console=console, transient=True)


def show_findings(findings, title="Findings"):
    if not findings:
        ok("No findings.")
        return
    console.print(Text(f"\n{title} ({len(findings)})", style="bold"))
    for f in findings:
        head = Text()
        head.append_text(sev_text(f.severity))
        head.append(f"  {f.title}", style="bold")
        console.print(head)
        if f.target:
            console.print(Text(f"  Target: {f.target}", style="dim"))
        console.print(Text(f"  {f.detail}"))
        console.print(Text(f"  Fix: {f.recommendation}", style="green"))
        console.print()
