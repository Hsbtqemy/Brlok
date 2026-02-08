# -*- coding: utf-8 -*-
"""Fenêtre principale Brlok."""
import subprocess
import sys

from PySide6.QtCore import Qt
from PySide6.QtCore import QSize
from PySide6.QtGui import QAction, QActionGroup, QCloseEvent
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QMenu,
    QMenuBar,
    QSizePolicy,
    QToolBar,
    QTabWidget,
    QWidget,
)

from brlok.generator import generate_session
from brlok.models import Catalog, Session
from brlok.storage.catalog_store import save_catalog
from brlok.storage.catalog_collection_store import get_active_catalog, load_collection, set_active_catalog
from brlok.storage.favorites_store import load_favorites
from brlok.storage.history_store import add_to_history
from brlok.storage.templates_store import get_template

from brlok.gui.catalog_widget import CatalogWidget
from brlok.gui.library_widget import LibraryWidget
from brlok.gui.session_widget import SessionWidget
from brlok.gui.theme import get_theme_manager


class BrlokMainWindow(QMainWindow):
    """Fenêtre principale avec catalogue, séance et favoris."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("Brlok")
        self.setMinimumSize(600, 500)
        self._catalog: Catalog = get_active_catalog()
        self._session: Session | None = None

        tabs = QTabWidget()
        self._catalog_combo = QComboBox()
        self._catalog_combo.setMinimumWidth(180)
        self._refresh_catalog_combo()
        self._catalog_combo.currentIndexChanged.connect(self._on_catalog_selected)

        # Toolbar top-right : catalogue + restart
        self._toolbar = QToolBar()
        self._toolbar.setObjectName("main_toolbar")
        self._toolbar.setMovable(False)
        self._toolbar.setFloatable(False)
        self._toolbar.setIconSize(QSize(16, 16))
        self._toolbar.setFixedHeight(40)
        self._toolbar.setStyleSheet("padding: 4px;")
        self._toolbar.addWidget(QLabel("Catalogue :"))
        self._toolbar.addWidget(self._catalog_combo)
        spacer = QWidget()
        spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        self._toolbar.addWidget(spacer)
        restart_action = QAction("↻ Redémarrer", self)
        restart_action.setToolTip("Relancer l'application")
        restart_action.triggered.connect(self._on_restart)
        self._toolbar.addAction(restart_action)
        self.addToolBar(self._toolbar)
        self._catalog_widget = CatalogWidget(
            self._catalog,
            on_save=self._save_catalog,
            on_new_catalog=self._on_new_catalog,
            on_set_default=self._set_current_catalog_as_default,
            catalog_combo=None,  # Sélecteur dans la toolbar
        )
        self._library_widget = LibraryWidget(
            on_load_session=self._load_session,
            on_go_session=lambda: self._tabs.setCurrentIndex(0),
        )
        self._session_widget = SessionWidget(
            self._catalog,
            session=None,
            on_generate=self._generate_session,
            on_favorites_changed=self._library_widget.refresh,
            on_end_session=self._on_end_session,
        )
        tabs.addTab(self._session_widget, "Séance")
        tabs.addTab(self._catalog_widget, "Catalogue")
        tabs.addTab(self._library_widget, "Bibliothèque")
        tabs.setCurrentIndex(0)
        tabs.currentChanged.connect(self._on_tab_changed)
        self._tabs = tabs

        self.setCentralWidget(tabs)
        self._setup_menu_bar()

    def _setup_menu_bar(self) -> None:
        """Menu Affichage -> Thème Clair/Sombre."""
        menubar = QMenuBar(self)
        self.setMenuBar(menubar)
        affichage = menubar.addMenu("Affichage")
        theme_menu = affichage.addMenu("Thème")
        theme_group = QActionGroup(self)
        theme_group.setExclusive(True)
        theme_manager = get_theme_manager()
        act_light = QAction("Clair", self)
        act_light.setCheckable(True)
        act_light.setChecked(theme_manager.get_current() == "light")
        act_light.triggered.connect(lambda: self._apply_theme("light"))
        theme_group.addAction(act_light)
        theme_menu.addAction(act_light)
        act_dark = QAction("Sombre", self)
        act_dark.setCheckable(True)
        act_dark.setChecked(theme_manager.get_current() == "dark")
        act_dark.triggered.connect(lambda: self._apply_theme("dark"))
        theme_group.addAction(act_dark)
        theme_menu.addAction(act_dark)

    def _apply_theme(self, name: str) -> None:
        """Applique le thème et rafraîchit l'affichage."""
        theme = get_theme_manager()
        theme.set_theme(name)
        app = QApplication.instance()
        if app:
            app.setStyleSheet(theme.get_stylesheet())

    def _refresh_catalog_combo(self) -> None:
        """Rafraîchit la liste des catalogues dans le sélecteur."""
        coll = load_collection()
        self._catalog_combo.blockSignals(True)
        self._catalog_combo.clear()
        active_idx = 0
        for i, entry in enumerate(coll.catalogs):
            label = f"{entry.name} ✓" if entry.id == coll.active_id else entry.name
            self._catalog_combo.addItem(label, entry.id)
            if entry.id == coll.active_id:
                active_idx = i
        self._catalog_combo.setCurrentIndex(active_idx)
        self._catalog_combo.blockSignals(False)

    def _set_current_catalog_as_default(self) -> None:
        """Définit le catalogue courant comme défaut (rechargé au démarrage)."""
        catalog_id = self._catalog_combo.currentData()
        if catalog_id and set_active_catalog(catalog_id):
            self._refresh_catalog_combo()
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.information(
                self,
                "Catalogue par défaut",
                "Ce catalogue sera chargé par défaut au prochain démarrage.",
            )

    def _on_catalog_selected(self, index: int) -> None:
        """Changement de catalogue actif (7.1)."""
        catalog_id = self._catalog_combo.currentData()
        if catalog_id and set_active_catalog(catalog_id):
            self._catalog = get_active_catalog()
            self._session_widget.set_catalog(self._catalog)
            self._catalog_widget.set_catalog(self._catalog)

    def _on_tab_changed(self, index: int) -> None:
        """Rafraîchit la bibliothèque quand on affiche l'onglet."""
        widget = self._tabs.widget(index)
        if widget == self._library_widget:
            self._library_widget.refresh()

    def _load_session(self, session: Session) -> None:
        """Charge une séance dans l'onglet Séance."""
        self._session = session
        self._session_widget.set_session(session)

    def _on_end_session(self, session: Session, block_statuses: dict[int, str]) -> None:
        """Enregistre la séance terminée dans l'historique (7.4)."""
        add_to_history(session, block_statuses)

    def _on_restart(self) -> None:
        """Relance l'application (nouvelle instance après sauvegarde)."""
        subprocess.Popen([sys.executable, "-m", "brlok"])
        QApplication.quit()

    def _on_new_catalog(self, catalog: Catalog, name: str) -> None:
        """Ajoute un nouveau catalogue à la collection (7.1)."""
        from brlok.storage.catalog_collection_store import add_catalog, set_active_catalog
        entry = add_catalog(name, catalog)
        set_active_catalog(entry.id)
        self._catalog = catalog
        self._refresh_catalog_combo()
        self._catalog_widget.set_catalog(catalog)
        self._session_widget.set_catalog(catalog)

    def _save_catalog(self, catalog: Catalog) -> None:
        """Sauvegarde et met à jour la référence du catalogue."""
        self._catalog = catalog
        save_catalog(catalog)
        self._session_widget.set_catalog(catalog)

    def _generate_session(
        self,
        level: int,
        blocks: int,
        enchainements: int,
        template_id: str | None,
    ) -> tuple[Session, object] | None:
        """Génère une séance (paramètres fournis par le formulaire intégré)."""
        active = [h for h in self._catalog.holds if h.active]
        if not active:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.warning(
                self,
                "Catalogue vide",
                "Ajoutez des prises dans l'onglet Catalogue avant de générer une séance.",
            )
            return None
        favorites = load_favorites()
        self._session = generate_session(
            self._catalog,
            target_level=level,
            blocks_count=blocks,
            enchainements=enchainements,
            favorite_blocks=favorites if favorites else None,
        )
        if not self._session.blocks:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.warning(
                self,
                "Aucune prise éligible",
                "Aucune prise active au niveau 1–3. Modifiez le catalogue ou les niveaux.",
            )
            return None
        template = get_template(template_id) if template_id else None
        return (self._session, template)

    @property
    def catalog(self) -> Catalog:
        """Catalogue des prises."""
        return self._catalog

    def closeEvent(self, event: QCloseEvent) -> None:
        """Sauvegarde le catalogue à la fermeture (NFR5). Les favoris sont sauvegardés à l'ajout."""
        save_catalog(self._catalog)
        super().closeEvent(event)
