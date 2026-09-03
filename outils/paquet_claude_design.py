#!/usr/bin/env python3
"""
Fabrique le paquet a joindre a Claude Design.

    python3 outils/paquet_claude_design.py

Ecrit docs/design/CODE_POUR_CLAUDE_DESIGN.md.

POURQUOI CE SCRIPT EXISTE. Claude Design concoit ce que les ecrans DEVRAIENT
etre. Pour ne pas inventer, il lui faut trois choses, et trois seulement :
  1. `api.js` — la verite sur ce que le serveur renvoie. Si un chiffre n'y est
     pas, aucun ecran ne peut l'afficher.
  2. `tokens.css` — le systeme visuel en vigueur : couleurs, rayons, ombres,
     tailles. Sans lui il redessine une palette a cote.
  3. Les ecrans — un INVENTAIRE de ce qui existe (filtres, etats vides,
     messages d'erreur), pas un modele a suivre.

A relancer AVANT chaque passe de design, jamais pendant : un paquet qui change
au milieu d'une conversation est pire qu'un paquet perime.
"""
import os, subprocess, datetime

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC  = os.path.join(BASE, "frontend", "src")
SORTIE = os.path.join(BASE, "docs", "design", "CODE_POUR_CLAUDE_DESIGN.md")
MIGRATIONS = os.path.join(BASE, "supabase", "migrations")

FICHIERS = [
    ("api.js — LE CONTRAT AVEC LE SERVEUR (a lire en premier)", "api.js"),
    ("styles/tokens.css — LE SYSTEME VISUEL EN VIGUEUR", "styles/tokens.css"),
    ("styles/index.css — le CSS des ecrans", "styles/index.css"),
    ("branding.js", "branding.js"),
    ("App.jsx — la navigation", "App.jsx"),
    ("components/Icons.jsx — les icones dessinees", "components/Icons.jsx"),
    ("components/Keypad.jsx — le pave numerique", "components/Keypad.jsx"),
    ("components/DigitBoxes.jsx — les cases de saisie", "components/DigitBoxes.jsx"),
    ("components/TimerRing.jsx — le chronometre", "components/TimerRing.jsx"),
    ("components/MasteryGrid.jsx — la grille de maitrise", "components/MasteryGrid.jsx"),
    ("components/Layout.jsx", "components/Layout.jsx"),
    ("screens/Home.jsx — accueil eleve ET accueil professeur", "screens/Home.jsx"),
    ("screens/Practice.jsx — selecteur, partie, fin de partie", "screens/Practice.jsx"),
    ("screens/Challenges.jsx — les defis (le plus gros)", "screens/Challenges.jsx"),
    ("screens/Leaderboards.jsx — les classements ET LEURS FILTRES", "screens/Leaderboards.jsx"),
    ("screens/MaClasse.jsx — l'ecran professeur", "screens/MaClasse.jsx"),
    ("screens/MesDefis.jsx", "screens/MesDefis.jsx"),
    ("screens/Profile.jsx — profil, badges, avatar, deconnexion", "screens/Profile.jsx"),
    ("screens/Learn.jsx", "screens/Learn.jsx"),
    ("screens/Login.jsx — connexion et compte non reconnu", "screens/Login.jsx"),
    ("screens/Admin.jsx — eleves, enseignants, import, journal", "screens/Admin.jsx"),
    ("logic/questions.js", "logic/questions.js"),
    ("logic/mastery.js", "logic/mastery.js"),
    ("logic/defiStorage.js", "logic/defiStorage.js"),
]

def commit():
    try:
        return subprocess.check_output(
            ["git", "-C", BASE, "log", "--oneline", "-1"],
            text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "(commit inconnu)"

ENTETE = """# matHo — le code actuel de l'application

> Genere le {date} — depuis le commit `{commit}`.
> Ne pas modifier a la main : relancer `python3 outils/paquet_claude_design.py`.

## Comment lire ce fichier

**1. `api.js` est le seul document qui dit la verite.** C'est le point de
passage unique vers le serveur : une quarantaine d'appels, et pour chacun
exactement ce que la base renvoie. Si un chiffre n'y est pas, il n'existe pas
et aucun ecran ne peut l'afficher.

**2. `tokens.css` est le systeme visuel en vigueur** — couleurs du logo, rayons,
ombres, tailles, durees, et la regle du pave numerique. C'est la seule source
de verite des couleurs : aucun ecran n'en ecrit en dur.

**3. Les ecrans sont un INVENTAIRE, pas un modele.** Ils disent ce qui existe :
quels filtres, quels boutons, quels etats vides, quels messages d'erreur. Ils
ne disent pas ce qui est bien. **Une horreur dans le code n'est jamais une
contrainte.**

## Les regles qui ne se voient pas dans le code

- **Aucun champ de texte libre, nulle part.** Pas de nom de defi, pas de
  message, pas de pseudo, pas de commentaire. Moderer du texte ecrit par 350
  collegiens est impossible pour l'etablissement. C'est absolu.
- **Aucune ressource exterieure.** Les iPads sont filtres par un MDM : pas de
  Google Fonts, pas de bibliotheque d'icones, pas d'image en ligne. Polices =
  fichiers du projet, icones = emoji ou SVG ecrit a la main.
- **Un ecran ne fabrique jamais une population.** Si un affichage a besoin d'un
  chiffre, c'est le serveur qui l'envoie. Cinq bugs de ce projet viennent d'un
  ratio deduit dans l'ecran — et l'erreur va toujours dans le sens rassurant.
- **Portrait, tactile, 11 a 15 ans, salle de classe sous neon.** Sauf l'ecran
  d'administration, qui s'utilise sur un Mac, en paysage.

---
"""

def main():
    parts = [ENTETE.format(date=datetime.date.today().isoformat(), commit=commit())]
    manquants = []
    for titre, rel in FICHIERS:
        p = os.path.join(SRC, rel)
        if not os.path.exists(p):
            manquants.append(rel); continue
        lang = "css" if rel.endswith(".css") else "jsx" if rel.endswith(".jsx") else "js"
        with open(p, encoding="utf-8") as f:
            contenu = f.read()
        parts.append("\n\n## %s\n\n`frontend/src/%s`\n\n```%s\n%s\n```\n"
                     % (titre, rel, lang, contenu))
    # --- Les migrations SQL, dans l'ordre ou elles s'appliquent -----------
    # C'est la SEULE source de verite sur ce que la base calcule. api.js dit
    # quels appels existent ; le SQL dit ce qu'ils renvoient et comment. Avec
    # les deux, on peut verifier soi-meme qu'un chiffre existe, sans demander.
    parts.append("\n\n---\n\n# Les migrations SQL — ce que la base calcule\n\n"
                 "Dans l'ordre d'application. La derniere version d'une fonction\n"
                 "est celle qui compte : une meme fonction peut etre reecrite\n"
                 "plusieurs fois au fil des migrations.\n")
    for nom in sorted(os.listdir(MIGRATIONS)):
        if not nom.endswith(".sql"):
            continue
        with open(os.path.join(MIGRATIONS, nom), encoding="utf-8") as f:
            parts.append("\n\n## %s\n\n```sql\n%s\n```\n" % (nom, f.read()))

    # --- ECRANS.md : l'intention de chaque ecran --------------------------
    ecrans = os.path.join(BASE, "ECRANS.md")
    if os.path.exists(ecrans):
        with open(ecrans, encoding="utf-8") as f:
            parts.append("\n\n---\n\n# ECRANS.md — l'intention de chaque ecran\n\n"
                         "Ecrit AVANT la construction. La ou il diverge du code,\n"
                         "c'est le code qui dit ce qui est, et ce document ce qui\n"
                         "etait vise.\n\n" + f.read())

    txt = "".join(parts)
    os.makedirs(os.path.dirname(SORTIE), exist_ok=True)
    with open(SORTIE, "w", encoding="utf-8") as f:
        f.write(txt)
    print("ecrit :", os.path.relpath(SORTIE, BASE))
    print("taille : %d octets (~%d k tokens)" % (len(txt), len(txt) // 4000))
    if manquants:
        print("ABSENTS (a verifier) :", ", ".join(manquants))

if __name__ == "__main__":
    main()
