# -*- coding: utf-8 -*-
"""Icône de l'application pour barre des tâches / dock."""
from __future__ import annotations

from pathlib import Path


def get_app_icon():
    """Retourne l'icône Brlok (QIcon) pour fenêtre et barre des tâches."""
    from PySide6.QtGui import QIcon

    # Fichier PNG personnalisé s'il existe (brlok/gui/icon.png)
    png_path = Path(__file__).parent / "icon.png"
    if png_path.exists():
        icon = QIcon(str(png_path))
        if not icon.isNull():
            return icon

    # Icône générée (forme de prise orange)
    icon = QIcon()
    for size in (16, 32, 48, 64, 128, 256):
        pix = _make_icon_pixmap(size)
        icon.addPixmap(pix)
    return icon


def _make_icon_pixmap(size: int):
    """Génère une icône programmatique : forme de prise avec accent orange + texte B."""
    from PySide6.QtCore import Qt
    from PySide6.QtGui import (
        QColor,
        QFont,
        QLinearGradient,
        QPainter,
        QPainterPath,
        QPixmap,
        QPen,
        QBrush,
    )

    pix = QPixmap(size, size)
    pix.fill(Qt.GlobalColor.transparent)

    painter = QPainter(pix)
    painter.setRenderHint(QPainter.RenderHint.Antialiasing)
    painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
    painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)

    margin = size // 8
    rect = pix.rect().adjusted(margin, margin, -margin, -margin)

    # Gradient orange/terracotta (couleur escalade)
    gradient = QLinearGradient(rect.topLeft(), rect.bottomRight())
    gradient.setColorAt(0, QColor(220, 110, 60))
    gradient.setColorAt(0.5, QColor(200, 85, 45))
    gradient.setColorAt(1, QColor(180, 70, 35))

    # Forme arrondie type prise (rectangle avec coins arrondis)
    path = QPainterPath()
    path.addRoundedRect(rect, size // 4, size // 4)

    painter.fillPath(path, QBrush(gradient))
    painter.setPen(QPen(QColor(160, 60, 30), max(1, size // 32)))
    painter.drawPath(path)

    # Texte "Brlok"
    font = QFont()
    font.setPixelSize(int(size * 0.28))
    font.setBold(True)
    painter.setFont(font)
    painter.setPen(QColor(255, 255, 255))
    painter.drawText(rect, Qt.AlignmentFlag.AlignCenter, "Brlok")

    painter.end()
    return pix
