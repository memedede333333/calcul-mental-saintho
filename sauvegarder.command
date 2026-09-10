#!/usr/bin/env bash
# =====================================================================
# Matho — Double-clic de Sauvegarde Base de Données
# =====================================================================
cd "$(dirname "$0")"
./scripts/sauvegarder.sh
echo ""
read -p "Appuyez sur Entrée pour fermer cette fenêtre..."
