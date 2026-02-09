# -*- coding: utf-8 -*-
"""Widget Timer 40/20, pyramides et EMOM (8.3)."""
from __future__ import annotations

from PySide6.QtCore import QTimer, Qt, QUrl, Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


class IntervalTimerWidget(QWidget):
    """Timer : 40/20, pyramides ou EMOM. Lisible à 2 m (NFR4)."""

    finished = Signal(float)  # temps total en secondes lorsque terminé

    MODE_40_20 = "40/20"
    MODE_PYRAMIDE = "pyramide"
    MODE_EMOM = "emom"

    CHRONO_COUNTDOWN = "countdown"
    CHRONO_COUNTUP = "countup"
    CHRONO_NONE = "none"

    def __init__(
        self,
        parent: QWidget | None = None,
        *,
        work_s: int = 40,
        rest_s: int = 20,
        rounds: int = 3,
        compact: bool = False,
        chrono_mode: str = "countdown",
    ) -> None:
        super().__init__(parent)
        self._compact = compact
        self._work_s = work_s
        self._rest_s = rest_s
        self._rounds = rounds
        self._work_min = 20
        self._work_max = 60
        self._chrono_mode = chrono_mode
        self._mode = self.MODE_40_20
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._remaining_s = 0
        self._phase: str = ""  # "work" | "rest"
        self._current_round = 0
        self._total_elapsed_s = 0.0
        self._sound_effect = None
        self._build_ui()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)

        self._config_container = QWidget()
        config_inner = QVBoxLayout(self._config_container)
        self._mode_combo = QComboBox()
        self._mode_combo.addItems([self.MODE_40_20, "Pyramide", "EMOM"])
        self._mode_combo.currentTextChanged.connect(self._on_mode_changed)
        self._work_spin = QSpinBox()
        self._work_spin.setRange(5, 300)
        self._work_spin.setValue(self._work_s)
        self._work_spin.valueChanged.connect(self._on_config_changed)
        self._rest_spin = QSpinBox()
        self._rest_spin.setRange(5, 120)
        self._rest_spin.setValue(self._rest_s)
        self._rest_spin.valueChanged.connect(self._on_config_changed)
        self._rounds_spin = QSpinBox()
        self._rounds_spin.setRange(1, 20)
        self._rounds_spin.setValue(self._rounds)
        self._rounds_spin.valueChanged.connect(self._on_config_changed)

        if self._compact:
            config_layout = QGridLayout()
            config_layout.setSpacing(4)
            config_layout.setContentsMargins(0, 0, 0, 2)
            config_layout.addWidget(QLabel("Mode:"), 0, 0)
            config_layout.addWidget(self._mode_combo, 0, 1)
            config_layout.addWidget(QLabel("Rounds:"), 0, 2)
            config_layout.addWidget(self._rounds_spin, 0, 3)
            config_layout.addWidget(QLabel("Travail:"), 1, 0)
            config_layout.addWidget(self._work_spin, 1, 1)
            config_layout.addWidget(QLabel("Repos:"), 1, 2)
            config_layout.addWidget(self._rest_spin, 1, 3)
        else:
            config_layout = QHBoxLayout()
            config_layout.addWidget(QLabel("Mode:"))
            config_layout.addWidget(self._mode_combo)
            config_layout.addWidget(QLabel("Travail (s):"))
            config_layout.addWidget(self._work_spin)
            config_layout.addWidget(QLabel("Repos (s):"))
            config_layout.addWidget(self._rest_spin)
            config_layout.addWidget(QLabel("Rounds:"))
            config_layout.addWidget(self._rounds_spin)
            config_layout.addStretch()
        config_inner.addLayout(config_layout)
        layout.addWidget(self._config_container)

        self._pyramide_layout = QHBoxLayout()
        self._pyramide_layout.setSpacing(4)
        self._pyramide_layout.addWidget(QLabel("Travail min:"))
        self._work_min_spin = QSpinBox()
        self._work_min_spin.setRange(5, 120)
        self._work_min_spin.setValue(20)
        self._work_min_spin.valueChanged.connect(self._on_config_changed)
        self._pyramide_layout.addWidget(self._work_min_spin)
        self._pyramide_layout.addWidget(QLabel("Travail max:"))
        self._work_max_spin = QSpinBox()
        self._work_max_spin.setRange(5, 300)
        self._work_max_spin.setValue(60)
        self._work_max_spin.valueChanged.connect(self._on_config_changed)
        self._pyramide_layout.addWidget(self._work_max_spin)
        self._pyramide_widget = QWidget()
        self._pyramide_widget.setLayout(self._pyramide_layout)
        self._pyramide_widget.setVisible(False)
        layout.addWidget(self._pyramide_widget)

        self._display_frame = QFrame()
        pad = 4 if self._compact else 20
        rad = 6 if self._compact else 12
        self._display_frame.setStyleSheet(
            f"background: #1a1a2e; border-radius: {rad}px; padding: {pad}px;"
        )
        disp_layout = QVBoxLayout(self._display_frame)
        disp_layout.setSpacing(2 if self._compact else 8)
        self._time_label = QLabel("00:00")
        time_fs = 26 if self._compact else 72
        self._time_label.setStyleSheet(
            f"font-size: {time_fs}pt; font-weight: bold; color: #eee;"
        )
        self._time_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._time_label.setMinimumHeight(48 if self._compact else 120)
        disp_layout.addWidget(self._time_label)
        self._phase_label = QLabel("")
        phase_fs = 10 if self._compact else 24
        self._phase_label.setStyleSheet(f"font-size: {phase_fs}pt; color: #aaa;")
        self._phase_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        disp_layout.addWidget(self._phase_label)
        layout.addWidget(self._display_frame)

        btn_layout = QHBoxLayout()
        self._start_btn = QPushButton("▶ Démarrer")
        self._start_btn.clicked.connect(self._on_start)
        self._start_btn.setMinimumHeight(28 if self._compact else 44)
        self._start_btn.setStyleSheet("font-size: 10pt;" if self._compact else "font-size: 14pt;")
        btn_layout.addWidget(self._start_btn)
        self._stop_btn = QPushButton("⏹ Arrêter")
        self._stop_btn.clicked.connect(self._on_stop)
        self._stop_btn.setEnabled(False)
        self._stop_btn.setMinimumHeight(28 if self._compact else 44)
        self._stop_btn.setStyleSheet("font-size: 11pt;" if self._compact else "")
        btn_layout.addWidget(self._stop_btn)
        layout.addLayout(btn_layout)

        self._update_display()
        self._on_mode_changed(self._mode_combo.currentText())
        self._update_chrono_mode_ui()

    def _update_chrono_mode_ui(self) -> None:
        """Affiche/masque la config selon le mode chrono."""
        if self._chrono_mode == self.CHRONO_COUNTUP:
            self._config_container.setVisible(False)
            self._pyramide_widget.setVisible(False)
            self._phase_label.setText("Minuteur")
        else:
            self._config_container.setVisible(True)
            self._on_mode_changed(self._mode_combo.currentText())

    def _get_mode(self) -> str:
        text = self._mode_combo.currentText()
        if text == "Pyramide":
            return self.MODE_PYRAMIDE
        if text == "EMOM":
            return self.MODE_EMOM
        return self.MODE_40_20

    def _on_mode_changed(self, text: str) -> None:
        mode = self._get_mode()
        self._pyramide_widget.setVisible(mode == self.MODE_PYRAMIDE)
        if mode == self.MODE_EMOM:
            self._rest_spin.setValue(max(5, 60 - self._work_spin.value()))
            self._rest_spin.setEnabled(False)
        else:
            self._rest_spin.setEnabled(True)

    def _get_work_rest_for_round(self, round_index: int) -> tuple[int, int]:
        """Retourne (work_s, rest_s) pour le round donné (1-based)."""
        mode = self._get_mode()
        rounds = self._rounds_spin.value()
        work_base = self._work_spin.value()
        rest_base = self._rest_spin.value()
        if mode == self.MODE_40_20:
            return (work_base, rest_base)
        if mode == self.MODE_EMOM:
            work = min(work_base, 55)
            rest = 60 - work
            return (work, rest)
        if mode == self.MODE_PYRAMIDE:
            wmin = self._work_min_spin.value()
            wmax = self._work_max_spin.value()
            if rounds <= 1:
                return (wmax, wmax // 2)
            progress = (round_index - 1) / (rounds - 1)
            work = int(wmin + (wmax - wmin) * progress)
            rest = work // 2
            return (max(5, work), max(5, rest))
        return (work_base, rest_base)

    def set_params(
        self,
        work_s: int,
        rest_s: int,
        rounds: int,
        work_min: int | None = None,
        work_max: int | None = None,
        chrono_mode: str | None = None,
    ) -> None:
        """Applique travail/repos/rounds (ex. depuis un template)."""
        if not self._timer.isActive():
            self._work_s = work_s
            self._rest_s = rest_s
            self._rounds = rounds
            self._work_spin.setValue(work_s)
            self._rest_spin.setValue(rest_s)
            self._rounds_spin.setValue(rounds)
            if work_min is not None:
                self._work_min_spin.setValue(work_min)
            if work_max is not None:
                self._work_max_spin.setValue(work_max)
            if chrono_mode is not None:
                self._chrono_mode = chrono_mode
                self._update_chrono_mode_ui()

    def _on_config_changed(self) -> None:
        if not self._timer.isActive():
            self._work_s = self._work_spin.value()
            self._rest_s = self._rest_spin.value()
            self._rounds = self._rounds_spin.value()
            self._work_min = self._work_min_spin.value()
            self._work_max = self._work_max_spin.value()
            if self._get_mode() == self.MODE_EMOM:
                self._rest_spin.setValue(max(5, 60 - self._work_s))

    def _on_start(self) -> None:
        self._work_s = self._work_spin.value()
        self._rest_s = self._rest_spin.value()
        self._rounds = self._rounds_spin.value()
        self._work_min = self._work_min_spin.value()
        self._work_max = self._work_max_spin.value()
        if self._chrono_mode == self.CHRONO_COUNTUP:
            self._start_btn.setEnabled(False)
            self._stop_btn.setEnabled(True)
            self._current_round = 0
            self._total_elapsed_s = 0.0
            self._phase = "countup"
            self._remaining_s = 0
        else:
            self._mode_combo.setEnabled(False)
            self._work_spin.setEnabled(False)
            self._rest_spin.setEnabled(False)
            self._rounds_spin.setEnabled(False)
            self._work_min_spin.setEnabled(False)
            self._work_max_spin.setEnabled(False)
            self._start_btn.setEnabled(False)
            self._stop_btn.setEnabled(True)
            self._current_round = 1
            self._total_elapsed_s = 0.0
            work, rest = self._get_work_rest_for_round(1)
            self._remaining_s = work
            self._phase = "work"
        self._update_display()
        self._timer.start(1000)

    def _on_stop(self) -> None:
        self._timer.stop()
        if self._chrono_mode != self.CHRONO_COUNTUP:
            self._mode_combo.setEnabled(True)
            self._work_spin.setEnabled(True)
            self._rest_spin.setEnabled(True)
            self._rounds_spin.setEnabled(True)
            self._work_min_spin.setEnabled(True)
            self._work_max_spin.setEnabled(True)
        self._start_btn.setEnabled(True)
        self._stop_btn.setEnabled(False)
        self._phase = ""
        self._update_display()

    def _tick(self) -> None:
        self._total_elapsed_s += 1
        if self._chrono_mode == self.CHRONO_COUNTUP:
            self._remaining_s = int(self._total_elapsed_s)
        else:
            self._remaining_s -= 1
            if self._remaining_s <= 0:
                self._on_interval_end()
        self._update_display()

    def _on_interval_end(self) -> None:
        if self._phase == "work":
            work, rest = self._get_work_rest_for_round(self._current_round)
            self._remaining_s = rest
            self._phase = "rest"
            self._play_signal()
        elif self._phase == "rest":
            self._current_round += 1
            if self._current_round > self._rounds:
                self._timer.stop()
                self._mode_combo.setEnabled(True)
                self._work_spin.setEnabled(True)
                self._rest_spin.setEnabled(True)
                self._rounds_spin.setEnabled(True)
                self._work_min_spin.setEnabled(True)
                self._work_max_spin.setEnabled(True)
                self._start_btn.setEnabled(True)
                self._stop_btn.setEnabled(False)
                self._phase = ""
                self._play_signal()
                self.finished.emit(self._total_elapsed_s)
                return
            work, rest = self._get_work_rest_for_round(self._current_round)
            self._remaining_s = work
            self._phase = "work"
            self._play_signal()
        self._update_display()

    def _play_signal(self) -> None:
        """Signal sonore + visuel à la fin d'un intervalle."""
        self._play_beep()
        self._flash_display()

    def _play_beep(self) -> None:
        """Joue un bip sonore (QSoundEffect ou fallback système)."""
        try:
            from PySide6.QtMultimedia import QSoundEffect
            if self._sound_effect is None:
                self._sound_effect = QSoundEffect()
                self._sound_effect.setVolume(0.4)
                wav_path = _get_beep_path()
                if wav_path:
                    self._sound_effect.setSource(QUrl.fromLocalFile(wav_path))
            if self._sound_effect and self._sound_effect.source().isValid():
                self._sound_effect.play()
        except Exception:
            pass

    def _flash_display(self) -> None:
        """Flash visuel à la fin d'un intervalle."""
        old = self._display_frame.styleSheet()
        rad, pad = (6, 8) if self._compact else (12, 20)
        self._display_frame.setStyleSheet(
            f"background: #2d5a27; border-radius: {rad}px; padding: {pad}px;"
        )
        from PySide6.QtCore import QTimer as QT
        QT.singleShot(200, lambda: self._display_frame.setStyleSheet(old))

    def _update_display(self) -> None:
        time_fs = 36 if self._compact else 72
        if self._chrono_mode == self.CHRONO_COUNTUP:
            elapsed = int(self._total_elapsed_s)
            m, s = elapsed // 60, elapsed % 60
            self._time_label.setText(f"{m:02d}:{s:02d}")
            self._phase_label.setText("Minuteur")
            self._time_label.setStyleSheet(
                f"font-size: {time_fs}pt; font-weight: bold; color: #4ade80;"
            )
            return
        m = self._remaining_s // 60
        s = self._remaining_s % 60
        self._time_label.setText(f"{m:02d}:{s:02d}")
        mode = self._get_mode()
        if self._phase == "work":
            self._phase_label.setText(f"Travail — Round {self._current_round}/{self._rounds}")
            self._time_label.setStyleSheet(
                f"font-size: {time_fs}pt; font-weight: bold; color: #4ade80;"
            )
        elif self._phase == "rest":
            self._phase_label.setText(f"Repos — Round {self._current_round}/{self._rounds}")
            self._time_label.setStyleSheet(
                f"font-size: {time_fs}pt; font-weight: bold; color: #fbbf24;"
            )
        else:
            label = f"{mode} — {self._rounds} rounds"
            self._phase_label.setText(label)
            self._time_label.setStyleSheet(
                f"font-size: {time_fs}pt; font-weight: bold; color: #eee;"
            )


def _get_beep_path() -> str | None:
    """Retourne le chemin du fichier beep.wav (généré si absent)."""
    import math
    import struct
    import wave
    try:
        from brlok.config.paths import get_data_dir
        cache_dir = get_data_dir() / "sounds"
        cache_dir.mkdir(parents=True, exist_ok=True)
        beep_path = cache_dir / "beep.wav"
        if not beep_path.exists():
            rate, duration, freq = 22050, 0.1, 880
            n = int(rate * duration)
            with wave.open(str(beep_path), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(rate)
                frames = b"".join(
                    struct.pack(
                        "<h",
                        int(32767 * 0.3 * math.sin(2 * math.pi * freq * i / rate)),
                    )
                    for i in range(n)
                )
                w.writeframes(frames)
        return str(beep_path)
    except Exception:
        return None