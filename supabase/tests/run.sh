#!/usr/bin/env bash
# =====================================================================
# Vérification des migrations sur un PostgreSQL local
# =====================================================================
# Rejoue les trois migrations depuis zéro, charge les données de démo,
# puis déroule un scénario complet : connexion, partie, badges, défi à
# deux joueurs, classements, et une série de tentatives de triche qui
# doivent toutes échouer.
#
# À lancer après CHAQUE modification des migrations.
#
#   ./supabase/tests/run.sh
#
# Prérequis : PostgreSQL 14+ installé localement.
# Fonctionne aussi contre `supabase start` en ajustant PGHOST/PGPORT.
# =====================================================================
set -euo pipefail

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
DB="${DB:-cms_test}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

psql_run() { psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -v ON_ERROR_STOP=1 "$@"; }

echo "▶ Base de test : $DB"
psql_run -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

echo "▶ Environnement Supabase simulé"
psql_run -d "$DB" -q -f "$ROOT/supabase/tests/00_prelude_local.sql" 2>/dev/null

echo "▶ Migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "  · $(basename "$f")"
  psql_run -d "$DB" -q -f "$f"
done

echo "▶ Données de démo"
psql_run -d "$DB" -q -f "$ROOT/supabase/seed.sql"

echo "▶ Comptes de test (simule une première connexion)"
psql_run -d "$DB" -q -c "insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','alice.dupont@demo.saintho.fr'),
  ('22222222-2222-2222-2222-222222222222','bob.martin@demo.saintho.fr'),
  ('33333333-3333-3333-3333-333333333333','prof.demo@demo.saintho.fr'),
  ('44444444-4444-4444-4444-444444444444','maths.demo@demo.saintho.fr'),
  ('55555555-5555-5555-5555-555555555555','david.petit@demo.saintho.fr');"

echo "▶ Scénario"
echo
psql_run -d "$DB" -f "$ROOT/supabase/tests/01_scenario.sql"

echo
echo "✅ Terminé. Vérifier qu'aucune ligne ne contient « ECHEC »."
