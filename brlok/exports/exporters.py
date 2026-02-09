# -*- coding: utf-8 -*-
"""Export de séances en TXT, Markdown, JSON et PDF (FR18, FR19, FR20, FR41)."""
from __future__ import annotations

import json
from pathlib import Path

from brlok.models import Catalog, Session


def _format_foot_grid_section(catalog: Catalog) -> list[str]:
    """Section Pieds pour export texte/markdown."""
    lines: list[str] = []
    if not catalog.foot_grid:
        return lines
    lines.append("Pieds (4×6):")
    foot_levels = getattr(catalog, "foot_levels", None) or [[1] * 6 for _ in range(4)]
    for r, row in enumerate(catalog.foot_grid):
        cells = []
        for c, cell in enumerate(row):
            spec = cell or ""
            lev = foot_levels[r][c] if r < len(foot_levels) and c < len(foot_levels[r]) else 1
            cells.append(f"{spec} ({lev})" if spec else "")
        lines.append("  " + " | ".join(cells))
    return lines


def export_txt(session: Session, path: Path, catalog: Catalog | None = None) -> None:
    """Exporte une séance en TXT lisible (FR18). UTF-8."""
    lines: list[str] = ["Séance d'entraînement Brlok", "=" * 40]
    if session.constraints.target_level is not None:
        lines.append(f"Niveau cible: {session.constraints.target_level}")
    if session.constraints.required_tags:
        lines.append(f"Tags à inclure: {', '.join(session.constraints.required_tags)}")
    if session.constraints.excluded_tags:
        lines.append(f"Tags exclus: {', '.join(session.constraints.excluded_tags)}")
    if session.constraints.variety:
        lines.append("Variété: oui")
    lines.append("")
    for i, block in enumerate(session.blocks, 1):
        lines.append(f"Bloc {i}:")
        for j, hold in enumerate(block.holds, 1):
            lines.append(f"  {j}. {hold.id}")
        if getattr(block, "foot_positions", None) and catalog and catalog.foot_grid:
            foot_specs = []
            for r, c in block.foot_positions:
                if r < len(catalog.foot_grid) and c < len(catalog.foot_grid[r]):
                    spec = catalog.foot_grid[r][c] or ""
                    if spec:
                        foot_specs.append(spec)
            if foot_specs:
                lines.append(f"  Pieds: {', '.join(foot_specs)}")
        if block.comment:
            lines.append(f"  # {block.comment}")
        lines.append("")
    if catalog:
        lines.extend(_format_foot_grid_section(catalog))
        if catalog.foot_grid:
            lines.append("")
    text = "\n".join(lines)
    path.write_text(text, encoding="utf-8")


def export_markdown(session: Session, path: Path, catalog: Catalog | None = None) -> None:
    """Exporte une séance en Markdown (FR19)."""
    lines: list[str] = ["# Séance d'entraînement Brlok", ""]
    if session.constraints.target_level is not None:
        lines.append(f"- **Niveau cible:** {session.constraints.target_level}")
    if session.constraints.required_tags:
        lines.append(f"- **Tags à inclure:** {', '.join(session.constraints.required_tags)}")
    if session.constraints.excluded_tags:
        lines.append(f"- **Tags exclus:** {', '.join(session.constraints.excluded_tags)}")
    if session.constraints.variety:
        lines.append("- **Variété:** oui")
    if any([session.constraints.target_level is not None, session.constraints.required_tags,
            session.constraints.excluded_tags, session.constraints.variety]):
        lines.append("")
    for i, block in enumerate(session.blocks, 1):
        lines.append(f"## Bloc {i}")
        lines.append("")
        for j, hold in enumerate(block.holds, 1):
            lines.append(f"{j}. {hold.id}")
        if getattr(block, "foot_positions", None) and catalog and catalog.foot_grid:
            foot_specs = []
            for r, c in block.foot_positions:
                if r < len(catalog.foot_grid) and c < len(catalog.foot_grid[r]):
                    spec = catalog.foot_grid[r][c] or ""
                    if spec:
                        foot_specs.append(spec)
            if foot_specs:
                lines.append("")
                lines.append(f"**Pieds:** {', '.join(foot_specs)}")
        if block.comment:
            lines.append("")
            lines.append(f"*{block.comment}*")
        lines.append("")
    if catalog and catalog.foot_grid:
        lines.append("## Pieds")
        lines.append("")
        lines.append("| " + " | ".join(str(i + 1) for i in range(6)) + " |")
        lines.append("|" + "---|" * 6)
        for row in catalog.foot_grid:
            lines.append("| " + " | ".join(cell or "" for cell in row) + " |")
        lines.append("")
    text = "\n".join(lines)
    path.write_text(text, encoding="utf-8")


def export_json(session: Session, path: Path) -> None:
    """Exporte une séance en JSON (session autonome, FR20). Rechargeable."""
    data = session.model_dump(mode="json")
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def export_pdf(session: Session, path: Path) -> None:
    """Exporte une séance en PDF (FR41). Lisible, encodage UTF-8, prêt pour impression."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    doc = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    styles = getSampleStyleSheet()
    story = []

    title = Paragraph(
        "<b>Séance d'entraînement Brlok</b>",
        styles["Title"],
    )
    story.append(title)
    story.append(Spacer(1, 0.5 * cm))

    if session.constraints.target_level is not None:
        story.append(
            Paragraph(
                f"<b>Niveau cible :</b> {session.constraints.target_level}",
                styles["Normal"],
            )
        )
    if session.constraints.required_tags:
        story.append(
            Paragraph(
                f"<b>Tags à inclure :</b> {', '.join(session.constraints.required_tags)}",
                styles["Normal"],
            )
        )
    if session.constraints.excluded_tags:
        story.append(
            Paragraph(
                f"<b>Tags exclus :</b> {', '.join(session.constraints.excluded_tags)}",
                styles["Normal"],
            )
        )
    if session.constraints.variety:
        story.append(Paragraph("<b>Variété :</b> oui", styles["Normal"]))
    if any(
        [
            session.constraints.target_level is not None,
            session.constraints.required_tags,
            session.constraints.excluded_tags,
            session.constraints.variety,
        ]
    ):
        story.append(Spacer(1, 0.5 * cm))

    for i, block in enumerate(session.blocks, 1):
        story.append(
            Paragraph(f"<b>Bloc {i}</b>", styles["Heading2"]),
        )
        items = " → ".join(f"{j}. {hold.id}" for j, hold in enumerate(block.holds, 1))
        story.append(Paragraph(items, styles["Normal"]))
        if block.comment:
            story.append(Paragraph(f"<i>{block.comment}</i>", styles["Normal"]))
        story.append(Spacer(1, 0.3 * cm))

    doc.build(story)
