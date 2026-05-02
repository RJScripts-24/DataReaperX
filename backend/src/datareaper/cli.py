from __future__ import annotations

import typer

from datareaper.services.report_service import ReportService

app = typer.Typer(help="DataReaper backend utilities")


@app.command()
def report(scan_id: str = "demo-scan") -> None:
    typer.echo(ReportService().get_report(scan_id))
