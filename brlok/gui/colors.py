# -*- coding: utf-8 -*-
"""Palette de couleurs par niveau de difficulté (Story 6.2, NFR4).

Niveaux 1–5 (aligné avec SessionConstraints). Si level hors 1–5, fallback gris.
"""

# Couleurs saturées (bloc en cours)
LEVEL_COLORS_SATURATED: dict[int, str] = {
    1: "#4caf50",  # Vert
    2: "#8bc34a",  # Vert clair
    3: "#ffeb3b",  # Jaune
    4: "#ff9800",  # Orange
    5: "#f44336",  # Rouge
}

# Couleurs pâles (hors bloc)
LEVEL_COLORS_PALE: dict[int, str] = {
    1: "#e8f5e9",
    2: "#f1f8e9",
    3: "#fffde7",
    4: "#fff3e0",
    5: "#ffebee",
}

INACTIVE_COLOR = "#e0e0e0"
EMPTY_COLOR = "#f5f5f5"
BORDER_DEFAULT = "#333"
BORDER_HIGHLIGHT = "#1565c0"


# Couleurs texte selon fond (lisibilité)
TEXT_ON_LIGHT = "#222"   # fonds clairs (EMPTY, PALE)
TEXT_ON_INACTIVE = "#444"  # fond gris inactif
TEXT_ON_SATURATED = "#fff"  # fonds saturés (highlighted)


def get_cell_style(
    hold_id: str,
    level: int,
    active: bool,
    highlighted: bool,
) -> str:
    """Retourne le style CSS pour une cellule du pan.
    Toujours définit color pour lisibilité (clair/sombre).
    Pas de margin (spacing géré par QGridLayout).
    """
    if hold_id == "·":
        bg = EMPTY_COLOR
        border = BORDER_DEFAULT
        color = TEXT_ON_LIGHT
    elif not active:
        bg = INACTIVE_COLOR
        border = BORDER_DEFAULT
        color = TEXT_ON_INACTIVE
    elif highlighted:
        bg = LEVEL_COLORS_SATURATED.get(level, "#e3f2fd")
        border = BORDER_HIGHLIGHT
        color = TEXT_ON_SATURATED
    else:
        bg = LEVEL_COLORS_PALE.get(level, "#f5f5f5")
        border = BORDER_DEFAULT
        color = TEXT_ON_LIGHT

    weight = "bold" if highlighted else "normal"
    return f"border: 2px solid {border}; background: {bg}; color: {color}; font-weight: {weight};"
