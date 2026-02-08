# -*- coding: utf-8 -*-
"""Gestionnaire de thèmes clair/sombre (lisibilité)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from PySide6.QtCore import QSettings

ThemeName = Literal["light", "dark"]

_SETTINGS_ORG = "brlok"
_SETTINGS_APP = "brlok"
_SETTINGS_THEME_KEY = "ui/theme"


@dataclass
class ThemePalette:
    """Palette de couleurs pour un thème."""

    name: str
    bg: str
    bg_sidebar: str
    bg_input: str
    bg_input_hover: str
    selection_bg: str
    selection_text: str
    text: str
    text_muted: str
    border: str


LIGHT_PALETTE = ThemePalette(
    name="light",
    bg="#f5f5f5",
    bg_sidebar="#e8e8e8",
    bg_input="#fff",
    bg_input_hover="#e8e8e8",
    selection_bg="#fff",
    selection_text="#222",
    text="#222",
    text_muted="#555",
    border="#ccc",
)

DARK_PALETTE = ThemePalette(
    name="dark",
    bg="#2d2d2d",
    bg_sidebar="#1e1e2e",
    bg_input="#404040",
    bg_input_hover="#505050",
    selection_bg="#fff",
    selection_text="#222",
    text="#e0e0e0",
    text_muted="#aaa",
    border="#555",
)


def _build_stylesheet(palette: ThemePalette) -> str:
    """Construit le stylesheet Qt à partir de la palette."""
    b = palette.bg
    bs = palette.bg_sidebar
    bi = palette.bg_input
    bih = palette.bg_input_hover
    sel_bg = palette.selection_bg
    sel_t = palette.selection_text
    t = palette.text
    tm = palette.text_muted
    br = palette.border
    return f"""
        QWidget {{ background-color: {b}; color: {t}; }}
        QMainWindow {{ background-color: {b}; }}
        QTabWidget::pane {{ background-color: {b}; }}
        QLabel {{ color: {t}; }}
        QLineEdit {{ background-color: {bi}; color: {t}; border: 1px solid {br}; }}
        QPushButton {{ background-color: {bi}; color: {t}; }}
        QPushButton:hover {{ background-color: {bih}; }}
        QListWidget {{ background-color: {bi}; color: {t}; }}
        QRadioButton {{ color: {t}; }}
        QSpinBox {{ background-color: {bi}; color: {t}; }}
        QComboBox {{ background-color: {bi}; color: {t}; }}
        QComboBox QAbstractItemView {{ selection-background-color: {sel_bg}; selection-color: {sel_t}; }}
        QScrollArea {{ background-color: {b}; color: {t}; }}
        QFrame#Sidebar {{ background-color: {bs}; color: {t}; padding: 12px; }}
        QFrame#Sidebar QLabel, QFrame#Sidebar QLineEdit, QFrame#Sidebar QSpinBox, QFrame#Sidebar QPushButton {{ color: {t}; }}
        QFrame#Sidebar QLineEdit, QFrame#Sidebar QSpinBox {{ background-color: {bi}; }}
        QFrame#Sidebar QPushButton {{ background-color: {bi}; padding: 8px 12px; font-size: 12pt; min-height: 1.2em; }}
        QFrame#Sidebar QLabel#SectionTitle {{ font-size: 14pt; font-weight: bold; }}
        QFrame#Sidebar QLabel#Muted {{ color: {tm}; }}
        QFrame#TimerPanel {{ background-color: {bi}; padding: 8px; border-radius: 6px; }}
        QFrame#EmptyState {{ background-color: {b}; padding: 48px; }}
        QLabel#EmptyLabel {{ font-size: 16pt; color: {tm}; }}
        QToolBar#main_toolbar {{ background-color: {bs}; }}
        QToolBar#main_toolbar QToolButton, QToolBar#main_toolbar QComboBox {{ color: {t}; }}
        QToolBar#main_toolbar QComboBox {{ background-color: {bi}; }}
        QFrame#GenerateBox {{ border: 1px solid {br}; border-radius: 6px; padding: 16px; }}
        QTableWidget#FootGrid {{ border: 1px solid {br}; border-radius: 4px; }}
        QTableWidget#FootGrid::item {{ padding: 4px; text-align: center; }}
    """


class ThemeManager:
    """Gestionnaire de thème avec persistance QSettings."""

    def __init__(self) -> None:
        self._current: ThemeName = "light"
        self._palette: ThemePalette = LIGHT_PALETTE
        self._load()

    def _load(self) -> None:
        """Charge le thème depuis QSettings."""
        s = QSettings(_SETTINGS_ORG, _SETTINGS_APP)
        name = s.value(_SETTINGS_THEME_KEY, "light")
        if name in ("light", "dark"):
            self._current = name
            self._palette = LIGHT_PALETTE if name == "light" else DARK_PALETTE

    def _save(self) -> None:
        """Sauvegarde le thème dans QSettings."""
        s = QSettings(_SETTINGS_ORG, _SETTINGS_APP)
        s.setValue(_SETTINGS_THEME_KEY, self._current)

    def get_current(self) -> ThemeName:
        """Retourne le thème actuel."""
        return self._current

    def get_palette(self) -> ThemePalette:
        """Retourne la palette actuelle."""
        return self._palette

    def set_theme(self, name: ThemeName) -> None:
        """Définit le thème et persiste."""
        self._current = name
        self._palette = LIGHT_PALETTE if name == "light" else DARK_PALETTE
        self._save()

    def get_stylesheet(self) -> str:
        """Retourne le stylesheet pour l'application."""
        return _build_stylesheet(self._palette)


_themed_instance: ThemeManager | None = None


def get_theme_manager() -> ThemeManager:
    """Retourne le gestionnaire de thème singleton."""
    global _themed_instance
    if _themed_instance is None:
        _themed_instance = ThemeManager()
    return _themed_instance
