# -*- coding: utf-8 -*-
"""Application Typer et sous-commandes CLI."""
import typer

app = typer.Typer(help="Brlok - Application d'entraînement bloc et pan.")


@app.command()
def generate() -> None:
    """Génère une séance d'entraînement."""
    typer.echo("Génération de séance (à implémenter en story 1.2+).")


if __name__ == "__main__":
    app()
