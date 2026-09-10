#!/usr/bin/env node
/**
 * check-api.mjs — le pont entre le SQL et les écrans ne se coupe pas en silence.
 *
 * POURQUOI CE SCRIPT EXISTE.
 * Le 4 septembre, la refonte de l'écran Administration (lot 20) a laissé
 * tomber le formulaire « ajouter un élève ». `ajouterEleve` est resté
 * importé en haut du fichier, plus une seule ligne ne l'appelait, et
 * personne ne l'a vu pendant trois lots — ni le build, ni les 183 cas de
 * test SQL, qui vérifient que le serveur répond juste, jamais que
 * quelqu'un l'appelle encore.
 *
 * Ce script vérifie les trois coutures qui peuvent lâcher sans bruit :
 *
 *   1. api.js appelle une RPC qui n'existe pas en base   → erreur à l'exécution
 *   2. api.js expose une fonction que plus aucun écran n'appelle → geste perdu
 *   3. un écran importe un nom qui n'est pas exporté     → écran cassé
 *
 * Les exceptions volontaires se déclarent dans TOLERES ci-dessous, avec
 * leur raison. Une exception sans raison n'en est pas une.
 *
 *   node frontend/scripts/check-api.mjs
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const API = 'frontend/src/api.js';
const SRC = 'frontend/src';
const MIGRATIONS = 'supabase/migrations';

// Fonctions exportées par api.js qu'aucun écran n'appelle, VOLONTAIREMENT.
// Chaque entrée porte sa raison. Vider cette liste est un bon objectif.
const TOLERES = new Map([
    // exemple : ['maFonction', 'gardée pour l écran X, prévu au lot 40'],
]);

function walk(dir, files = []) {
    for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) walk(full, files);
        else if (f.endsWith('.js') || f.endsWith('.jsx')) files.push(full);
    }
    return files;
}

const api = readFileSync(API, 'utf-8');
let errors = 0;

// ---------------------------------------------------------------------
// 1. Toute RPC appelée existe-t-elle en base ?
// ---------------------------------------------------------------------
const sqlFunctions = new Set();
for (const f of readdirSync(MIGRATIONS).filter(n => n.endsWith('.sql'))) {
    const t = readFileSync(join(MIGRATIONS, f), 'utf-8');
    for (const m of t.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)/gi)) {
        sqlFunctions.add(m[1].toLowerCase());
    }
}

const rpcAppelees = new Set();
for (const m of api.matchAll(/(?:rpc|mettreEnAttente)\(\s*'([a-z0-9_]+)'/g)) rpcAppelees.add(m[1]);

for (const nom of [...rpcAppelees].sort()) {
    if (!sqlFunctions.has(nom)) {
        console.error(`[RPC INTROUVABLE] ${API} appelle « ${nom} », qui n'est définie dans aucune migration.`);
        errors++;
    }
}

// ---------------------------------------------------------------------
// 2. Toute fonction exposée est-elle encore appelée par un écran ?
// ---------------------------------------------------------------------
const exports_ = new Set();
for (const m of api.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) exports_.add(m[1]);

let front = '';
for (const f of walk(SRC)) {
    if (f.endsWith('api.js')) continue;
    front += readFileSync(f, 'utf-8') + '\n';
}

for (const nom of [...exports_].sort()) {
    const utilise = new RegExp(`\\b${nom}\\b`).test(front);
    if (utilise) continue;
    if (TOLERES.has(nom)) {
        console.log(`  · toléré : ${nom} — ${TOLERES.get(nom)}`);
        continue;
    }
    console.error(`[GESTE PERDU] ${API} exporte « ${nom} », qu'aucun écran n'appelle. Soit un écran l'a perdue dans une refonte, soit elle est morte : rebranche-la, supprime-la, ou déclare-la dans TOLERES avec sa raison.`);
    errors++;
}

// ---------------------------------------------------------------------
// 3. Tout nom importé depuis api.js est-il bien exporté ?
// ---------------------------------------------------------------------
for (const f of walk(SRC)) {
    if (f.endsWith('api.js')) continue;
    const t = readFileSync(f, 'utf-8');
    for (const m of t.matchAll(/import\s*\{([^}]+)\}\s*from\s*'[^']*\/api'/g)) {
        for (let nom of m[1].split(',')) {
            nom = nom.trim().split(/\s+as\s+/)[0].trim();
            if (!nom || exports_.has(nom)) continue;
            console.error(`[IMPORT MORT] ${f} importe « ${nom} » depuis api.js, qui ne l'exporte pas.`);
            errors++;
        }
    }
}

if (errors > 0) {
    console.error(`\n❌ ÉCHEC : ${errors} couture(s) rompue(s) entre le SQL et les écrans.`);
    process.exit(1);
} else {
    console.log(`✅ SUCCÈS : ${rpcAppelees.size} RPC appelées existent toutes en base, ${exports_.size} fonctions exposées sont toutes utilisées.`);
}
