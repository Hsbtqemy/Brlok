# -*- coding: utf-8 -*-
"""Tests d'instanciation des widgets Pan et Session (tests manuels complémentaires)."""
import pytest
from PySide6.QtWidgets import QApplication

from brlok.gui.pan_widget import PanWidget
from brlok.gui.session_widget import SessionWidget
from brlok.gui.timer_widget import IntervalTimerWidget
from brlok.models import Catalog, GridDimensions, Hold, Position


@pytest.fixture(scope="module")
def qapp():
    """QApplication nécessaire pour les widgets Qt."""
    app = QApplication.instance()
    if app is None:
        app = QApplication([])
    return app


def test_pan_widget_instanciation(qapp) -> None:
    """PanWidget s'instancie sans erreur."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    widget = PanWidget(catalog)
    assert widget is not None


def test_session_widget_instanciation(qapp) -> None:
    """SessionWidget s'instancie sans erreur."""
    catalog = Catalog(
        holds=[Hold(id="A1", level=2, tags=[], position=Position(row=0, col=0))],
        grid=GridDimensions(rows=4, cols=8),
    )
    widget = SessionWidget(catalog)
    assert widget is not None


def test_timer_widget_instanciation(qapp) -> None:
    """IntervalTimerWidget s'instancie sans erreur (8.3)."""
    widget = IntervalTimerWidget(work_s=40, rest_s=20, rounds=3)
    assert widget is not None
