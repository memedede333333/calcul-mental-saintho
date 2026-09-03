#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// 1. Extraire toutes les variables définies dans tokens.css
const tokensContent = readFileSync('frontend/src/styles/tokens.css', 'utf-8');
const definedTokens = new Set();
const defRegex = /--([a-zA-Z0-9_-]+)\s*:/g;
let m;
while ((m = defRegex.exec(tokensContent)) !== null) {
    definedTokens.add(m[1]);
}

// Variables CSS définies dynamiquement ou standards du navigateur
const knownDynamic = new Set([
    // s'il y a des variables injectées par inline-style
]);

function walk(dir, files = []) {
    for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk(full, files);
        } else if (f.endsWith('.css') || f.endsWith('.jsx') || f.endsWith('.js')) {
            files.push(full);
        }
    }
    return files;
}

const files = walk('frontend/src');
let errors = 0;

for (const file of files) {
    if (file.endsWith('tokens.css')) continue;
    const content = readFileSync(file, 'utf-8');
    
    // Définitions locales dans ce fichier
    const localDefs = new Set();
    while ((m = defRegex.exec(content)) !== null) {
        localDefs.add(m[1]);
    }
    
    // Usages de var(--quelque-chose)
    const useRegex = /var\(\s*--([a-zA-Z0-9_-]+)/g;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let useMatch;
        while ((useMatch = useRegex.exec(line)) !== null) {
            const varName = useMatch[1];
            if (!definedTokens.has(varName) && !localDefs.has(varName) && !knownDynamic.has(varName)) {
                console.error(`[UNDEFINED VAR] ${file}:${i + 1} -> var(--${varName}) n'est pas définie dans tokens.css`);
                errors++;
            }
        }
    }
}

if (errors > 0) {
    console.error(`\n❌ ÉCHEC : ${errors} variable(s) CSS non définie(s) trouvée(s).`);
    process.exit(1);
} else {
    console.log(`✅ SUCCÈS : Toutes les variables CSS appelées dans frontend/src sont bien définies (${definedTokens.size} tokens actifs).`);
}
