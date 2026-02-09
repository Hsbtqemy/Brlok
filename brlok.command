#!/bin/bash
# -*- coding: utf-8 -*-
# Launcher Brlok pour macOS (double-clic dans le Finder)
# Ouvre le Terminal et lance l'application

cd "$(dirname "$0")"
python3 launch_brlok.py
read -p "Appuyez sur Entrée pour fermer…"
