# -*- coding: utf-8 -*-
"""Application Typer et sous-commandes CLI."""
import json
from pathlib import Path

import typer
from pydantic import ValidationError

from brlok.exports import export_json as export_json_fn
from brlok.exports import export_markdown
from brlok.exports import export_pdf
from brlok.exports import export_txt
from brlok.generator import generate_session
from brlok.models import Session
from brlok.storage.catalog_store import load_catalog, save_catalog
from brlok.storage.import_ods import import_catalog_from_ods
from brlok.storage.catalog_ops import update_hold_active, update_hold_level, update_hold_tags, _parse_tags_input
from brlok.storage.catalog_collection_store import (
    add_catalog,
    load_collection,
    set_active_catalog,
)
from brlok.storage.favorites_store import load_favorites
from brlok.storage.history_store import get_by_id, load_history
from brlok.storage.templates_store import get_template_by_name, load_templates, remove_template, rename_template

app = typer.Typer(help="Brlok - Application d'entraînement bloc et pan.")

_LEVEL_MAP = {"facile": 1, "modéré": 2, "modere": 2, "difficile": 3}


@app.command()
def generate(
    level: int | None = typer.Option(None, "--level", "-l", help="Niveau cible (1-5)"),
    blocks: int | None = typer.Option(None, "--blocks", "-b", help="Nombre de blocs"),
    enchainements: int | None = typer.Option(None, "--enchainements", "-e", help="Nombre de prises par bloc"),
    template: str | None = typer.Option(None, "--template", "-T", help="Template à utiliser (nom ou id)"),
    tags: str | None = typer.Option(None, "--tags", "-t", help="Tags obligatoires (forcer), ex. crimp,sloper"),
    exclude_tags: str | None = typer.Option(None, "--exclude-tags", help="Tags exclus (filtrer), ex. sloper"),
    variety: bool = typer.Option(False, "--variety", "-v", help="Éviter les répétitions de prises dans les blocs"),
    output: Path | None = typer.Option(None, "--output", "-o", help="Fichier de sortie (txt, md ou json)"),
) -> None:
    """Génère une séance d'entraînement."""
    catalog = load_catalog()
    blocks_count = blocks
    n_enchainements = enchainements
    target_level = level

    if not template and level is None:
        typer.echo("Indiquez --level ou --template", err=True)
        raise typer.Exit(1)

    if template:
        tpl = get_template_by_name(template)
        if not tpl:
            typer.echo(f"Template introuvable : {template}", err=True)
            typer.echo("Templates disponibles :", err=True)
            for t in load_templates():
                typer.echo(f"  - {t.name} (id: {t.id})", err=True)
            raise typer.Exit(1)
        blocks_count = blocks_count if blocks_count is not None else tpl.blocks_count
        n_enchainements = n_enchainements if n_enchainements is not None else tpl.holds_per_block
        if target_level is None and tpl.blocks_config:
            cfg = tpl.blocks_config[0]
            val = cfg.level
            if isinstance(val, int):
                target_level = val
            else:
                target_level = _LEVEL_MAP.get(str(val).lower().strip(), 2)
    else:
        target_level = level

    if target_level is None:
        target_level = 2
    if blocks_count is None:
        blocks_count = 5
    if n_enchainements is None:
        n_enchainements = 5

    if not (1 <= target_level <= 5):
        typer.echo("Niveau invalide : doit être entre 1 et 5", err=True)
        raise typer.Exit(1)
    required_tags = _parse_tags_input(tags) if tags else []
    excluded_tags = _parse_tags_input(exclude_tags) if exclude_tags else []
    overlap = set(required_tags) & set(excluded_tags)
    if overlap:
        typer.echo(
            f"Tags à la fois requis et exclus (incohérent) : {', '.join(sorted(overlap))}",
            err=True,
        )
        raise typer.Exit(1)
    favorites = load_favorites()
    n_favorites = len(favorites) if favorites else 0
    session = generate_session(
        catalog,
        target_level=target_level,
        blocks_count=blocks_count,
        enchainements=n_enchainements,
        required_tags=required_tags if required_tags else None,
        excluded_tags=excluded_tags if excluded_tags else None,
        variety=variety,
        favorite_blocks=favorites if favorites else None,
    )
    if blocks_count and blocks_count > 0 and len(session.blocks) <= n_favorites:
        typer.echo(
            "Aucun bloc généré : contraintes trop strictes (niveau, tags). "
            "Assouplissez les critères ou ajoutez des prises au catalogue.",
            err=True,
        )
        raise typer.Exit(1)
    parts = [f"{len(session.blocks)} blocs", f"niveau {target_level}"]
    if required_tags:
        parts.append(f"tags: {','.join(required_tags)}")
    if excluded_tags:
        parts.append(f"exclu: {','.join(excluded_tags)}")
    if variety:
        parts.append("variété")
    if template:
        parts.append(f"template: {template}")
    if favorites:
        parts.append(f"favoris: {len(favorites)}")
    typer.echo(f"Séance générée : {', '.join(parts)}")
    for i, block in enumerate(session.blocks, 1):
        ids = " → ".join(h.id for h in block.holds)
        typer.echo(f"  Bloc {i}: {ids}")

    if output:
        suffix = output.suffix.lower()
        if suffix == ".pdf":
            export_pdf(session, output)
        elif suffix == ".txt":
            export_txt(session, output)
        elif suffix in (".md", ".markdown"):
            export_markdown(session, output)
        else:
            export_json_fn(session, output)
        typer.echo(f"Exporté dans {output}")


catalog_app = typer.Typer(help="Consultation et modification du catalogue des prises.")


@catalog_app.command("import")
def catalog_import(
    ods_file: Path = typer.Argument(..., help="Fichier ODS à importer"),
) -> None:
    """Importe le catalogue depuis un fichier ODS (feuille Liste prises + Niveau)."""
    try:
        catalog = import_catalog_from_ods(ods_file)
        save_catalog(catalog)
        typer.echo(f"Catalogue importé : {len(catalog.holds)} prises, grille {catalog.grid.rows}×{catalog.grid.cols}")
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)


@catalog_app.command("catalogs")
def catalog_catalogs() -> None:
    """Liste les catalogues (multi-pan 7.1)."""
    coll = load_collection()
    if not coll.catalogs:
        typer.echo("(aucun catalogue)")
        return
    for entry in coll.catalogs:
        mark = " *" if entry.id == coll.active_id else ""
        typer.echo(f"  {entry.name} (id: {entry.id}){mark}")


@catalog_app.command("use")
def catalog_use(
    name_or_id: str = typer.Argument(..., help="Nom ou ID du catalogue"),
) -> None:
    """Sélectionne le catalogue actif (7.1)."""
    coll = load_collection()
    for entry in coll.catalogs:
        if entry.id == name_or_id or entry.name == name_or_id:
            if set_active_catalog(entry.id):
                typer.echo(f"Catalogue actif : {entry.name}")
                return
    typer.echo(f"Catalogue introuvable : {name_or_id}", err=True)
    raise typer.Exit(1)


@catalog_app.command("list")
def catalog_list() -> None:
    """Affiche la liste des prises du catalogue."""
    catalog = load_catalog()
    typer.echo(f"Grille: {catalog.grid.rows}×{catalog.grid.cols}")
    typer.echo("-" * 60)
    if not catalog.holds:
        typer.echo("(aucune prise)")
        return
    for hold in sorted(catalog.holds, key=lambda h: (h.position.row, h.position.col)):
        tags_str = ", ".join(hold.tags) if hold.tags else "-"
        actif = "oui" if hold.active else "non"
        typer.echo(f"  {hold.id:6} | niv {hold.level} | pos ({hold.position.row},{hold.position.col}) | tags: {tags_str} | actif: {actif}")


@catalog_app.command("edit")
def catalog_edit(
    hold_id: str = typer.Argument(..., help="ID de la prise (ex. A1, C7)"),
    level: int | None = typer.Option(None, "--level", "-l", help="Nouveau niveau 1-5"),
    tags: str | None = typer.Option(None, "--tags", "-t", help="Tags séparés par virgule (ex. crimp,sloper)"),
    active: bool | None = typer.Option(None, "--active/--no-active", help="Activer ou désactiver la prise"),
) -> None:
    """Modifie la difficulté, les tags et/ou le statut actif d'une prise."""
    if level is None and tags is None and active is None:
        typer.echo("Indiquez --level, --tags et/ou --active/--no-active", err=True)
        raise typer.Exit(1)
    catalog = load_catalog()
    try:
        if level is not None:
            catalog = update_hold_level(catalog, hold_id, level)
        if tags is not None:
            new_tags = _parse_tags_input(tags)
            catalog = update_hold_tags(catalog, hold_id, new_tags)
        if active is not None:
            catalog = update_hold_active(catalog, hold_id, active)
    except ValidationError:
        typer.echo("Niveau invalide : doit être entre 1 et 5", err=True)
        raise typer.Exit(1)
    except ValueError as e:
        typer.echo(str(e), err=True)
        raise typer.Exit(1)
    save_catalog(catalog)
    parts = []
    if level is not None:
        parts.append(f"niveau {level}")
    if tags is not None:
        parts.append(f"tags: {tags}")
    if active is not None:
        parts.append("actif" if active else "inactif")
    typer.echo(f"Prise {hold_id} : {', '.join(parts)}")


favorites_app = typer.Typer(help="Blocs favoris.")


@favorites_app.command("list")
def favorites_list() -> None:
    """Affiche la liste des blocs favoris."""
    blocks = load_favorites()
    if not blocks:
        typer.echo("(aucun favori)")
        return
    for i, block in enumerate(blocks, 1):
        ids = " → ".join(h.id for h in block.holds)
        typer.echo(f"  {i}. {ids}")


export_app = typer.Typer(help="Export de séances (TXT, Markdown, JSON, PDF).")


@export_app.command("txt")
def export_txt_cmd(
    input_file: Path = typer.Argument(..., help="Fichier JSON de la séance"),
    output: Path = typer.Option(..., "--output", "-o", help="Fichier TXT de sortie"),
) -> None:
    """Exporte une séance en TXT."""
    session = _load_session(input_file)
    export_txt(session, output)
    typer.echo(f"Exporté dans {output}")


@export_app.command("md")
def export_md_cmd(
    input_file: Path = typer.Argument(..., help="Fichier JSON de la séance"),
    output: Path = typer.Option(..., "--output", "-o", help="Fichier Markdown de sortie"),
) -> None:
    """Exporte une séance en Markdown."""
    session = _load_session(input_file)
    export_markdown(session, output)
    typer.echo(f"Exporté dans {output}")


@export_app.command("json")
def export_json_cmd(
    input_file: Path = typer.Argument(..., help="Fichier JSON de la séance"),
    output: Path = typer.Option(..., "--output", "-o", help="Fichier JSON de sortie"),
) -> None:
    """Exporte une séance en JSON (copie ou conversion)."""
    session = _load_session(input_file)
    export_json_fn(session, output)
    typer.echo(f"Exporté dans {output}")


@export_app.command("pdf")
def export_pdf_cmd(
    input_file: Path = typer.Argument(..., help="Fichier JSON de la séance"),
    output: Path = typer.Option(..., "--output", "-o", help="Fichier PDF de sortie"),
) -> None:
    """Exporte une séance en PDF."""
    session = _load_session(input_file)
    export_pdf(session, output)
    typer.echo(f"Exporté dans {output}")


def _load_session(path: Path) -> Session:
    """Charge une Session depuis un fichier JSON."""
    if not path.exists():
        typer.echo(f"Fichier introuvable : {path}", err=True)
        raise typer.Exit(1)
    try:
        data = path.read_text(encoding="utf-8")
        return Session.model_validate_json(data)
    except (json.JSONDecodeError, ValidationError) as e:
        typer.echo(f"Session invalide : {e}", err=True)
        raise typer.Exit(1)


history_app = typer.Typer(help="Historique des séances terminées (7.4).")


@history_app.command("list")
def history_list() -> None:
    """Affiche la liste des séances enregistrées."""
    sessions = load_history()
    if not sessions:
        typer.echo("(aucune séance enregistrée)")
        return
    for i, cs in enumerate(sessions, 1):
        date_str = cs.date.strftime("%Y-%m-%d %H:%M") if cs.date else "?"
        typer.echo(f"  {i}. {date_str} — {len(cs.session.blocks)} bloc(s) (id: {cs.id[:8]}...)")


@history_app.command("show")
def history_show(
    session_id: str = typer.Argument(..., help="ID de la séance (8 premiers caractères) ou index numéro"),
) -> None:
    """Affiche le détail d'une séance (blocs, commentaires, statuts)."""
    sessions = load_history()
    if not sessions:
        typer.echo("(aucune séance enregistrée)", err=True)
        raise typer.Exit(1)

    # Chercher par index (1-based) ou par id
    cs = None
    if session_id.isdigit():
        idx = int(session_id)
        if 1 <= idx <= len(sessions):
            cs = sessions[idx - 1]
    if cs is None:
        cs = get_by_id(session_id) or next(
            (s for s in sessions if s.id.startswith(session_id)),
            None,
        )
    if not cs:
        typer.echo(f"Séance introuvable : {session_id}", err=True)
        raise typer.Exit(1)

    date_str = cs.date.strftime("%d/%m/%Y à %H:%M") if cs.date else "?"
    typer.echo(f"Séance du {date_str}")
    if cs.session.constraints.target_level is not None:
        typer.echo(f"Niveau cible : {cs.session.constraints.target_level}")
    typer.echo("")

    for i, block in enumerate(cs.session.blocks):
        status = cs.block_statuses.get(i, "")
        status_str = " ✓" if status == "success" else (" ✗" if status == "fail" else "")
        seq = " → ".join(h.id for h in block.holds)
        typer.echo(f"  Bloc {i + 1}{status_str}: {seq}")
        if block.comment:
            typer.echo(f"       # {block.comment}")


best_times_app = typer.Typer(help="Meilleurs temps par bloc (8.2).")


@best_times_app.command("list")
def best_times_list() -> None:
    """Affiche les meilleurs temps enregistrés."""
    from brlok.storage.best_times_store import load_best_times
    data = load_best_times()
    if not data:
        typer.echo("(aucun temps enregistré)")
        return
    for key, entry in data.items():
        seq = entry.get("sequence", "?")
        sec = entry.get("seconds", 0)
        date = entry.get("date", "?")[:10]
        typer.echo(f"  {seq}: {sec:.0f} s ({date})")


templates_app = typer.Typer(help="Templates de séance (8.1).")


@templates_app.command("list")
def templates_list() -> None:
    """Liste les templates disponibles."""
    templates = load_templates()
    if not templates:
        typer.echo("(aucun template)")
        return
    for t in templates:
        cfg = t.blocks_config[0] if t.blocks_config else None
        timing = f" — {cfg.work_s}s/{cfg.rest_s}s × {cfg.rounds}r" if cfg else ""
        typer.echo(f"  {t.name} (id: {t.id}) — {t.blocks_count} blocs × {t.holds_per_block} prises{timing}")


@templates_app.command("remove")
def templates_remove(
    name_or_id: str = typer.Argument(..., help="Nom ou ID du template à supprimer"),
) -> None:
    """Supprime un template."""
    tpl = get_template_by_name(name_or_id)
    if not tpl:
        typer.echo(f"Template introuvable : {name_or_id}", err=True)
        raise typer.Exit(1)
    if remove_template(tpl.id):
        typer.echo(f"Template supprimé : {tpl.name}")
    else:
        typer.echo("Impossible de supprimer : gardez au moins un template.", err=True)
        raise typer.Exit(1)


@templates_app.command("rename")
def templates_rename(
    name_or_id: str = typer.Argument(..., help="Nom ou ID du template à renommer"),
    new_name: str = typer.Argument(..., help="Nouveau nom"),
) -> None:
    """Renomme un template."""
    tpl = get_template_by_name(name_or_id)
    if not tpl:
        typer.echo(f"Template introuvable : {name_or_id}", err=True)
        raise typer.Exit(1)
    if rename_template(tpl.id, new_name):
        typer.echo(f"Template renommé : {tpl.name} → {new_name.strip()}")
    else:
        typer.echo("Impossible de renommer le template", err=True)
        raise typer.Exit(1)


app.add_typer(catalog_app, name="catalog")
app.add_typer(favorites_app, name="favorites")
app.add_typer(export_app, name="export")
app.add_typer(history_app, name="history")
app.add_typer(best_times_app, name="best-times")
app.add_typer(templates_app, name="template")


if __name__ == "__main__":
    app()
