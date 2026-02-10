#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Build Brlok en .exe (Windows) ou .app (macOS).
À lancer à la racine du projet : python scripts/build_release.py

Nécessite : pip install pyinstaller && pip install -e .
"""
from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)


def main() -> None:
    system = platform.system()
    entry = "brlok/__main__.py"
    name = "Brlok"
    base = f"--name={name}"
    windowed = "--windowed"
    clean = "--clean"
    noconfirm = "--noconfirm"

    if system == "Windows":
        # Un seul .exe
        cmd = [
            sys.executable, "-m", "pyinstaller",
            "--onefile",
            windowed,
            base,
            clean,
            noconfirm,
            entry,
        ]
        subprocess.run(cmd, check=True)
        print("Build OK → dist/Brlok.exe")
    elif system == "Darwin":
        # Bundle .app (onedir par défaut avec --windowed)
        cmd = [
            sys.executable, "-m", "pyinstaller",
            windowed,
            base,
            clean,
            noconfirm,
            entry,
        ]
        subprocess.run(cmd, check=True)
        print("Build OK → dist/Brlok.app")
    else:
        # Linux : onefile sans .app
        cmd = [
            sys.executable, "-m", "pyinstaller",
            "--onefile",
            base,
            clean,
            noconfirm,
            entry,
        ]
        subprocess.run(cmd, check=True)
        print("Build OK → dist/Brlok")


if __name__ == "__main__":
    main()
