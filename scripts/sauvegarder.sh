#!/usr/bin/env bash
# =====================================================================
# Matho — Script de Sauvegarde de la Base de Données
# =====================================================================
# Ce script :
# 1. Lit SUPABASE_DB_URL dans frontend/.env.local ou l'environnement.
# 2. Exécute pg_dump pour extraire le schéma public complet et les données.
# 3. Vérifie rigoureusement le contenu (taille, tables clés, comptage élèves).
# 4. Compresse le dump en .sql.gz (horodaté avec n° migration et commit Git).
# 5. Dépose une copie dans le dossier Google Drive local (Mon Drive/Sauvegardes Matho).
# 6. Purge les sauvegardes de plus de 180 jours (rétention 6 mois).
# =====================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Couleurs pour le terminal
VERT='\033[0;32m'
ROUGE='\033[0;31m'
JAUNE='\033[1;33m'
CYAN='\033[0;36m'
GRAS='\033[1m'
NC='\033[0m' # No Color

echo -e "${GRAS}${CYAN}=====================================================================${NC}"
echo -e "${GRAS}${CYAN}   MATHO — Sauvegarde de la Base de Données Supabase                 ${NC}"
echo -e "${GRAS}${CYAN}=====================================================================${NC}"
echo ""

# ---------------------------------------------------------------------
# 1. Récupération de l'URL de connexion PostgreSQL
# ---------------------------------------------------------------------
ENV_FILE="${ROOT_DIR}/frontend/.env.local"
DB_URL="${SUPABASE_DB_URL:-}"

if [ -z "${DB_URL}" ] && [ -f "${ENV_FILE}" ]; then
    # Extraction propre de SUPABASE_DB_URL si présent dans .env.local
    DB_URL=$(grep -E '^SUPABASE_DB_URL=' "${ENV_FILE}" | cut -d '=' -f2- | tr -d '"' | tr -d "'" || true)
fi

if [ -z "${DB_URL}" ]; then
    echo -e "${ROUGE}${GRAS}❌ ERREUR : La variable SUPABASE_DB_URL n'est pas configurée.${NC}"
    echo ""
    echo "Pour configurer votre connexion de sauvegarde :"
    echo "1. Ouvrez Supabase Dashboard › Project Settings › Database."
    echo "2. Dans la section « Connection string › URI », copiez l'adresse PostgreSQL."
    echo "3. Ajoutez cette ligne dans votre fichier frontend/.env.local :"
    echo "   SUPABASE_DB_URL=\"postgresql://postgres:[VOTRE_MOT_DE_PASSE]@db.lkukdlspcgqtiimvwlsd.supabase.co:5432/postgres\""
    echo ""
    exit 1
fi

# ---------------------------------------------------------------------
# 2. Détection de la version du code (Git & Migrations)
# ---------------------------------------------------------------------
DATE_STR=$(date +"%Y-%m-%d_%Hh%M")

GIT_COMMIT="inconnu"
if command -v git >/dev/null 2>&1 && [ -d "${ROOT_DIR}/.git" ]; then
    GIT_COMMIT=$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo "inconnu")
fi

# Dernière migration appliquée dans supabase/migrations/
LAST_MIG="00"
if [ -d "${ROOT_DIR}/supabase/migrations" ]; then
    LAST_MIG_FILE=$(ls "${ROOT_DIR}/supabase/migrations"/*.sql 2>/dev/null | sort | tail -n 1 || true)
    if [ -n "${LAST_MIG_FILE}" ]; then
        LAST_MIG=$(basename "${LAST_MIG_FILE}" | cut -d '_' -f1)
    fi
fi

BACKUP_NAME="matho_db_${DATE_STR}_mig-${LAST_MIG}_git-${GIT_COMMIT}"
BACKUPS_DIR="${ROOT_DIR}/backups"
mkdir -p "${BACKUPS_DIR}"

RAW_SQL="${BACKUPS_DIR}/${BACKUP_NAME}.sql"
GZ_SQL="${BACKUPS_DIR}/${BACKUP_NAME}.sql.gz"

echo -e "📦 Préparation du dump pour ${GRAS}${BACKUP_NAME}${NC}…"

# ---------------------------------------------------------------------
# 3. Extraction via pg_dump
# ---------------------------------------------------------------------
PG_DUMP_BIN="pg_dump"
if [ -f "/opt/homebrew/bin/pg_dump" ]; then
    PG_DUMP_BIN="/opt/homebrew/bin/pg_dump"
fi

if ! command -v "${PG_DUMP_BIN}" >/dev/null 2>&1; then
    echo -e "${ROUGE}❌ Erreur : pg_dump n'est pas disponible.${NC}"
    exit 1
fi

echo "⏳ Connexion à Supabase et extraction des données…"
"${PG_DUMP_BIN}" "${DB_URL}" \
    --schema=public \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --file="${RAW_SQL}"

# ---------------------------------------------------------------------
# 4. Contrôles de validation stricts (Anti-sauvegarde vide)
# ---------------------------------------------------------------------
echo "🔍 Vérification de l'intégrité du fichier généré…"

# Test 4.1 : Présence et taille minimale (> 20 Ko)
if [ ! -f "${RAW_SQL}" ]; then
    echo -e "${ROUGE}❌ Erreur fatale : Le fichier de dump n'a pas été créé.${NC}"
    exit 1
fi

FILE_SIZE=$(wc -c < "${RAW_SQL}" | tr -d ' ')
if [ "${FILE_SIZE}" -lt 20000 ]; then
    echo -e "${ROUGE}❌ ALERTE : Le fichier dump est anormalement petit (${FILE_SIZE} octets). Sauvegarde rejetée.${NC}"
    rm -f "${RAW_SQL}"
    exit 1
fi

# Test 4.2 : Vérification de la présence des tables clés
for TABLE in "eleves" "sessions_jeu" "maitrise" "defis"; do
    if ! grep -q -E "(COPY public\.${TABLE}|INSERT INTO public\.${TABLE})" "${RAW_SQL}"; then
        echo -e "${ROUGE}❌ ALERTE : Table capitale 'public.${TABLE}' absente du dump ! Sauvegarde rejetée.${NC}"
        rm -f "${RAW_SQL}"
        exit 1
    fi
done

# Test 4.3 : Vérification du nombre d'élèves (> 250 attendus pour 313 inscrits)
NB_ELEVES=0
if grep -q "COPY public\.eleves " "${RAW_SQL}"; then
    NB_ELEVES=$(sed -n '/COPY public\.eleves /,/\\\./p' "${RAW_SQL}" | grep -v '^COPY' | grep -v '^\\\.' | wc -l | tr -d ' ')
fi

if [ "${NB_ELEVES}" -lt 250 ]; then
    echo -e "${ROUGE}❌ ALERTE : Nombre d'élèves anormalement bas dans le dump (${NB_ELEVES} élèves trouvés, minimum 250 requis). Sauvegarde rejetée.${NC}"
    rm -f "${RAW_SQL}"
    exit 1
fi

echo -e "   ✅ Taille valide : ${FILE_SIZE} octets"
echo -e "   ✅ Tables clés présentes : eleves, sessions_jeu, maitrise, defis"
echo -e "   ✅ Population vérifiée : ${GRAS}${NB_ELEVES} élèves${NC} comptabilisés"

# ---------------------------------------------------------------------
# 5. Compression gzip
# ---------------------------------------------------------------------
gzip -c "${RAW_SQL}" > "${GZ_SQL}"
rm -f "${RAW_SQL}"

GZ_SIZE_KB=$(du -k "${GZ_SQL}" | cut -f1)
echo -e "   ✅ Archive compressée : ${GRAS}${BACKUP_NAME}.sql.gz${NC} (${GZ_SIZE_KB} Ko)"

# ---------------------------------------------------------------------
# 6. Copie vers Google Drive (si monté sur le Mac)
# ---------------------------------------------------------------------
GDRIVE_DIR="${HOME}/Google Drive/Mon Drive/Sauvegardes Matho"

if [ -d "${HOME}/Google Drive/Mon Drive" ]; then
    mkdir -p "${GDRIVE_DIR}"
    cp "${GZ_SQL}" "${GDRIVE_DIR}/"
    echo -e "${VERT}   ☁️  Copie déposée dans Google Drive :${NC}"
    echo -e "      ${GDRIVE_DIR}/${BACKUP_NAME}.sql.gz"
else
    echo -e "${JAUNE}   ⚠️ Dossier Google Drive non détecté à ${HOME}/Google Drive/Mon Drive. Sauvegarde conservée uniquement en local.${NC}"
fi

# ---------------------------------------------------------------------
# 7. Rétention : Purge automatique des fichiers de plus de 180 jours (6 mois)
# ---------------------------------------------------------------------
echo "🧹 Nettoyage des anciennes sauvegardes (> 180 jours)…"
find "${BACKUPS_DIR}" -name "matho_db_*.sql.gz" -mtime +180 -delete 2>/dev/null || true
if [ -d "${GDRIVE_DIR}" ]; then
    find "${GDRIVE_DIR}" -name "matho_db_*.sql.gz" -mtime +180 -delete 2>/dev/null || true
fi

echo ""
echo -e "${VERT}${GRAS}=====================================================================${NC}"
echo -e "${VERT}${GRAS}   SUCCÈS : Sauvegarde terminée et validée avec succès !             ${NC}"
echo -e "${VERT}${GRAS}=====================================================================${NC}"
echo ""
