# Lot 13 — la refonte visuelle

C'est le plus gros lot du projet, et le dernier avant la rentrée. Il touche
tous les écrans. Prends-le dans l'ordre donné : les quatre premiers points ne
sont pas du décor, ce sont les fondations sur lesquelles tout le reste
s'appuie.

---

## 0. La migration 24 — à appliquer dans Supabase avant tout le reste

Elle est **déjà écrite et déjà testée** : 107 cas de scénario, tous verts, sur
une base locale reconstruite depuis zéro. Tu ne l'écris pas, tu l'appliques.

**Ce que tu fais, exactement :**

1. Le fichier existe dans le dépôt :
   `supabase/migrations/20260903080000_apercu_import.sql`.
   Son contenu est recopié ci-dessous pour que tu l'aies sous la main — **mais
   c'est le fichier du dépôt qui fait foi.** Si les deux diffèrent, c'est le
   fichier qui a raison.
2. Applique-la sur le projet Supabase de **développement**
   (`calcul-mental-dev`, référence `lkukdlspcgqtiimvwlsd`).
3. **Régénère `database.ts`** derrière.
4. **Ne lance JAMAIS `supabase/tests/run.sh` contre Supabase.** Ce script
   *détruit et recrée* une base, y applique `00_prelude_local.sql` (qui
   simule un environnement Supabase) puis `seed.sql`. Il est fait pour un
   PostgreSQL local, et pour rien d'autre. Sur le projet de développement il
   effacerait les comptes de bêta réels. **Les 107 cas ont déjà été exécutés
   et sont verts** — tu n'as pas à les rejouer.

   Ce que tu vérifies après avoir appliqué la migration, et c'est tout :
   `apercu_import_eleves(jsonb)` et `valider_lignes_import(jsonb)` existent,
   `importer_eleves` renvoie maintenant `dont_reactivations`, et un appel à
   `apercu_import_eleves('[]'::jsonb)` depuis un compte élève est refusé.
5. **N'écris jamais de SQL directement dans l'éditeur Supabase.** Tout passe par
   un fichier de migration versionné, sinon la base de développement et celle de
   production divergeront sans un seul message d'erreur.

<details>
<summary><b>Le SQL de la migration 24</b></summary>

```sql
-- ---------------------------------------------------------------------
-- Migration 24 : l'import de rentree se regarde avant de s'executer
--
-- Le probleme, tel qu'il est apparu en dessinant l'ecran d'administration.
-- `importer_eleves` ecrit. Il n'existait aucun moyen de savoir ce qu'un
-- fichier allait produire avant qu'il ne l'ait produit. Or c'est la seule
-- operation du projet ou une erreur coute une soiree : 350 lignes, une
-- colonne decalee, et personne ne s'en apercoit avant que les eleves ne
-- se connectent.
--
-- Trois manques, et un defaut.
--
-- 1. Aucun apercu. On ne peut pas dire « voila ce qui serait ecrit ».
-- 2. Une seule raison pour tous les rejets : « email invalide ou champ
--    manquant ». L'administrateur qui recoit ca doit rouvrir son tableur
--    et chercher lui-meme.
-- 3. Aucune distinction entre une mise a jour et une REACTIVATION. Un
--    eleve desactive en juin qui reapparait dans le fichier de septembre
--    redevient actif en silence. C'est le bon comportement, mais il doit
--    se voir.
--
-- Le defaut, lui, est plus serieux : DEUX LIGNES DU MEME FICHIER portant
-- le meme e-mail etaient traitees deux fois. La premiere creait la fiche,
-- la seconde la mettait a jour — et `crees` + `mis_a_jour` comptaient
-- deux fois un seul eleve. Un doublon dans un export de vie scolaire
-- n'a rien d'exceptionnel. Desormais la seconde occurrence est rejetee,
-- en disant a quelle ligne se trouve la premiere.
--
-- LA REGLE DE CONSTRUCTION. L'apercu et l'import ne redisent pas les
-- memes regles chacun de leur cote : ils appellent tous les deux
-- `valider_lignes_import`. Deux copies des regles, c'est deux copies qui
-- divergent au premier correctif, et un apercu qui ment est pire que
-- pas d'apercu du tout.
--
-- POPULATIONS. `creations`, `mises_a_jour` et `ignorees` partitionnent
-- les lignes du FICHIER : leur somme fait exactement le nombre de lignes.
-- `dont_reactivations` est un SOUS-ENSEMBLE de `mises_a_jour` — le mot
-- « dont » est dans le nom pour qu'on ne l'additionne jamais au reste.
-- `actifs_absents_du_fichier` porte sur la BASE, pas sur le fichier :
-- c'est une autre population, jamais a rapprocher en fraction.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. La validation, ecrite une seule fois
--
-- Renvoie un tableau, une entree par ligne du fichier, dans l'ordre :
--   { ligne, index, email, nom, prenom, classe,
--     statut : 'creation' | 'mise_a_jour' | 'reactivation' | 'ignoree',
--     raison : text (seulement si ignoree),
--     rattachable : boolean }
--
-- `ligne` reprend le champ `ligne` de l'objet s'il existe (le front
-- connait le numero de ligne reel de son CSV, en-tete comprise), sinon
-- la position dans le tableau. C'est ce numero qui est affiche a
-- l'administrateur : lui donner un index decale de un serait lui faire
-- chercher la mauvaise ligne dans son tableur.
-- ---------------------------------------------------------------------
create or replace function public.valider_lignes_import(p_eleves jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res      jsonb := '[]';
  e          jsonb;
  v_idx      int;
  v_ligne    int;
  v_email    text;
  v_statut   text;
  v_raison   text;
  v_existe   boolean;
  v_actif    boolean;
  v_vus      jsonb := '{}';   -- email -> numero de ligne de la 1re occurrence
  v_rattach  boolean;
  v_brut     text;
begin
  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  v_idx := 0;
  for e in select * from jsonb_array_elements(p_eleves) loop
    v_idx    := v_idx + 1;
    -- Le front peut porter son propre numero de ligne (son CSV a une
    -- en-tete). On ne le croit que s'il est vraiment un entier : un
    -- numero fantaisiste ferait chercher la mauvaise ligne.
    v_brut   := e->>'ligne';
    v_ligne  := case when v_brut ~ '^[0-9]+$' then v_brut::int else v_idx end;
    v_email  := lower(trim(coalesce(e->>'email', '')));
    v_statut := null;
    v_raison := null;
    v_rattach := false;
    v_existe := null;
    v_actif  := null;

    -- Les rejets, du plus grossier au plus fin. Une seule raison par
    -- ligne : celle qui est la plus utile a corriger en premier.
    if v_email = '' then
      v_raison := 'e-mail manquant';
    elsif v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_raison := 'e-mail invalide — ' || v_email;
    elsif coalesce(trim(e->>'prenom'), '') = '' then
      v_raison := 'prenom manquant';
    elsif coalesce(trim(e->>'nom'), '') = '' then
      v_raison := 'nom manquant';
    elsif coalesce(trim(e->>'classe'), '') = '' then
      v_raison := 'classe vide';
    elsif jsonb_exists(v_vus, v_email) then
      v_raison := 'e-mail deja present ligne ' || (v_vus->>v_email);
    end if;

    if v_raison is not null then
      v_statut := 'ignoree';
    else
      v_vus := v_vus || jsonb_build_object(v_email, v_ligne::text);

      select true, actif into v_existe, v_actif
        from public.eleves where lower(email) = v_email;

      if not coalesce(v_existe, false) then
        v_statut := 'creation';
      elsif coalesce(v_actif, true) then
        v_statut := 'mise_a_jour';
      else
        v_statut := 'reactivation';
      end if;

      -- Un compte Google existe-t-il deja pour cet e-mail, sans fiche ?
      -- (migration 22 : la rentree est echelonnee, des eleves ouvrent
      -- l'application avant que leur classe ne soit importee.)
      select exists (
        select 1 from auth.users u
         where lower(u.email) = v_email
           and not exists (select 1 from public.eleves x where x.user_id = u.id)
           and not exists (select 1 from public.profs  p where p.user_id = u.id)
      ) into v_rattach;
    end if;

    v_res := v_res || jsonb_build_object(
      'ligne',       v_ligne,
      'index',       v_idx,
      'email',       nullif(v_email, ''),
      'nom',         e->>'nom',
      'prenom',      e->>'prenom',
      'classe',      e->>'classe',
      'statut',      v_statut,
      'raison',      v_raison,
      'rattachable', v_rattach
    );
  end loop;

  return v_res;
end;
$$;

comment on function public.valider_lignes_import(jsonb) is
  'Regles de validation d''un fichier d''import, ecrites UNE SEULE FOIS : apercu_import_eleves et importer_eleves l''appellent tous les deux. N''ecrit rien. Statut par ligne : creation | mise_a_jour | reactivation | ignoree. Un e-mail en double dans le fichier est ignore a partir de la SECONDE occurrence, en nommant la ligne de la premiere.';

revoke all on function public.valider_lignes_import(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. L'apercu : ce que le fichier ferait, sans rien ecrire
-- ---------------------------------------------------------------------
create or replace function public.apercu_import_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lignes   jsonb;
  v_absents  jsonb;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  v_lignes := public.valider_lignes_import(p_eleves);

  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)
           order by classe, nom, prenom), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  return jsonb_build_object(
    'lignes_lues',        jsonb_array_length(p_eleves),
    'creations',          (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'creation'),
    'mises_a_jour',       (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' in ('mise_a_jour', 'reactivation')),
    'dont_reactivations', (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'reactivation'),
    'ignorees',           (select count(*) from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'rattachables',       (select count(*) from jsonb_array_elements(v_lignes) l
                            where (l->>'rattachable')::boolean),
    'lignes_ignorees',    (select coalesce(jsonb_agg(l order by (l->>'index')::int), '[]')
                             from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.apercu_import_eleves(jsonb) is
  'Ce que le fichier PRODUIRAIT. N''ecrit rien, ne journalise rien : on peut l''appeler autant de fois qu''on veut. Memes populations et memes noms que importer_eleves, aux memes regles (fonction de validation commune), pour que l''ecran affiche avant exactement ce qu''il affichera apres. `dont_reactivations` est un sous-ensemble de `mises_a_jour`, jamais a additionner. `actifs_absents_du_fichier` porte sur la BASE, pas sur le fichier.';

grant execute on function public.apercu_import_eleves(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. L'import, reecrit sur la validation commune
--
-- Le texte d'origine (migration 22) est repris tel quel ; seule la
-- boucle change, pour lire le statut au lieu de le recalculer. Les
-- garde-fous, la journalisation et la forme du retour ne bougent pas —
-- sauf `dont_reactivations`, ajoute, et `lignes_ignorees` qui porte
-- maintenant une raison exploitable.
-- ---------------------------------------------------------------------
create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_reac       int := 0;
  v_rattaches  int := 0;
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  v_lignes     jsonb;
  l            jsonb;
  v_email      text;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  -- Memes regles que l'apercu, parce que c'est la meme fonction.
  v_lignes := public.valider_lignes_import(p_eleves);

  for l in select * from jsonb_array_elements(v_lignes) loop
    if l->>'statut' = 'ignoree' then
      v_ignores := v_ignores || l;
      continue;
    end if;

    v_email := l->>'email';

    if l->>'statut' = 'creation' then
      insert into public.eleves (email, nom, prenom, classe, plafond_tables)
      values (v_email, l->>'nom', l->>'prenom', l->>'classe',
              public.plafond_par_defaut(l->>'classe'));
      v_crees := v_crees + 1;
    else
      update public.eleves
         set nom    = l->>'nom',
             prenom = l->>'prenom',
             classe = l->>'classe',
             actif  = true
       where lower(email) = v_email;
      v_maj := v_maj + 1;
      if l->>'statut' = 'reactivation' then
        v_reac := v_reac + 1;
      end if;
    end if;

    -- MIGRATION 22 — rejoue pour chaque ligne, creee comme mise a jour :
    -- la rentree echelonnee garantit que des eleves auront ouvert
    -- l'application avant l'import de leur classe.
    if public.rattacher_par_email(v_email) is not null then
      v_rattaches := v_rattaches + 1;
    end if;
  end loop;

  -- Qui est actif en base mais absent du fichier ?
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)
           order by classe, nom, prenom), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  perform public.journaliser('import_eleves', null, jsonb_build_object(
    'crees', v_crees, 'mis_a_jour', v_maj, 'dont_reactivations', v_reac,
    'rattaches', v_rattaches,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'dont_reactivations', v_reac,
    'rattaches', v_rattaches,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_eleves(jsonb) is
  'Import de rentree. Ne desactive personne : un eleve absent du fichier est seulement signale dans `actifs_absents_du_fichier`. Populations : `crees` + `mis_a_jour` + le nombre de `lignes_ignorees` font exactement le nombre de lignes du FICHIER ; `dont_reactivations` est un SOUS-ENSEMBLE de `mis_a_jour` (eleves desactives redevenus actifs), jamais a additionner ; `actifs_absents_du_fichier` compte les eleves ACTIFS de la BASE absents du fichier — une autre population, jamais a rapprocher en fraction. `rattaches` compte les fiches reliees a un compte Google preexistant (migration 22). Un e-mail en double dans le fichier n''est traite qu''une fois : les occurrences suivantes sont ignorees (migration 24). Memes regles que apercu_import_eleves, par construction.';

grant execute on function public.importer_eleves(jsonb) to authenticated;
```

</details>

---

## Ce qui est déjà dans le dépôt

| fichier | ce que c'est | ce que tu en fais |
|---|---|---|
| `supabase/migrations/20260903080000_apercu_import.sql` | la migration 24 | tu l'appliques (point 0) |
| `frontend/src/styles/tokens.css` | **toutes** les couleurs, rayons, ombres, tailles, durées | tu l'importes et tu t'en sers partout |
| `docs/design/matHo-refonte-v2.dc.html` | les 10 maquettes | **tu regardes, tu ne recopies pas** (sauf les SVG — voir §6) |

---

## 1. Les polices — rien ne s'affiche correctement sans elles

Les maquettes sont dessinées en **Baloo 2** (titres et nombres) et **Nunito**
(texte). Elles ne sont pas dans le dépôt et **on ne peut pas les charger depuis
Google** : les iPads passent par un filtre MDM, la requête n'aboutira jamais.
Il faut les fichiers.

Récupère les deux fontes variables au format `woff2` et pose-les ici, sous ces
noms exacts — `tokens.css` les appelle déjà :

```
frontend/public/fonts/baloo2-variable.woff2
frontend/public/fonts/nunito-variable.woff2
```

Le plus simple :

```
cd frontend
npm install --no-save @fontsource-variable/baloo-2 @fontsource-variable/nunito
mkdir -p public/fonts
cp node_modules/@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2 public/fonts/baloo2-variable.woff2
cp node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2 public/fonts/nunito-variable.woff2
```

Si les chemins ont changé dans le paquet, adapte — mais **garde les deux noms
de destination**, et **commite les deux `.woff2`** : ils doivent être servis par
Vercel, pas installés à la volée.

**À vérifier avant de continuer** : dans l'onglet Réseau, les deux `.woff2`
partent bien depuis notre domaine, et **aucune** requête vers
`fonts.googleapis.com` ou `fonts.gstatic.com`. S'il en reste une, la police ne
s'affichera pas en classe et personne ne comprendra pourquoi.

---

## 2. `tokens.css` devient la seule source de vérité des couleurs

Importe-le en tête de `frontend/src/styles/index.css`, avant tout le reste.

Puis **remplace toutes les couleurs en dur** du CSS actuel par les variables.
La règle, sans exception : `#` ne doit plus apparaître ailleurs que dans
`tokens.css`.

Les correspondances, l'ancienne palette vers la nouvelle :

| avant | après | |
|---|---|---|
| `#1B2A4A` (navy) | `var(--indigo)` | `#20226B` — l'indigo du logo, pas un bleu-gris |
| or `#C9A227` | `var(--action)` | **le bleu ciel `#23A4D9`** devient la couleur d'action |
| menthe `#00C9A7` | `var(--vert)` | `#018F4B` |
| corail `#FF5A5F` | `var(--erreur-eleve)` | `#E4736F` pour l'élève, `var(--erreur-donnee)` `#E02020` pour les barres du professeur |
| `#F5A524` | `var(--orange)` | `#F38E1A` |
| violet `#8B6FC0` | — | **supprimé**, il n'existe pas dans le logo |

Dans les composants, préfère les **rôles** aux couleurs brutes :
`var(--action)` plutôt que `var(--ciel)`, `var(--succes)` plutôt que
`var(--vert)`. Le jour où l'action change de couleur, il y aura un seul endroit
à toucher.

**Le seul or qui reste** est `var(--podium)`, pour la première marche du
classement. Un podium sans or ne se lit pas ; partout ailleurs l'or a disparu.

---

## 3. Ce que tu ne dois PAS recopier de la maquette

Le fichier `.dc.html` est une **planche de maquettes**, pas une feuille de
style : 783 styles écrits directement dans les balises, 1 736 tailles en pixels
durs, zéro classe réutilisable. Il est parfait à regarder et dangereux à
copier. Trois pièges :

**a) La barre d'état « 22:46 · Wi-Fi · 18 % » fait partie du cadre de l'iPad,
pas de l'application.** Si tu la codes, matHo dessinera une fausse barre iOS à
l'intérieur de sa propre page.

**b) Les cadres sont figés à 834 × 1194.** L'application tournera aussi sur un
iPad de 820 de large et sur un iPad mini de 744. Les valeurs en pixels de la
maquette sont des *exemples*, pas la règle. La règle est au point 4.

**c) Aucun `:hover` sur ce que touche un élève.** Un doigt ne survole pas, et
sur iOS un état de survol reste collé après le relâchement. Tout retour visuel
passe par `:active` ou par une classe posée en JavaScript. `tokens.css`
neutralise déjà le halo de tap.

**Une exception, et une seule : l'écran d'administration.** Il s'utilise sur un
Mac, avec une souris. Un survol discret sur une ligne de tableau y est utile.
Ne l'éradique pas là-bas — mais il ne sort pas de cet écran.

---

## 4. Le pavé numérique — la seule décision qu'il ne faut pas rater

C'est l'écran le plus vu de l'application : un élève y passe des centaines de
questions. L'iPad est **posé à plat sur la table, tenu d'aucune main** : le
doigt part du bord bas. D'où la disposition, qui n'est pas négociable :

- **Le pavé occupe le bas, plein cadre**, et prend **44 % de la hauteur utile**
  (`var(--pave-part)`) — 4 rangées et 3 gouttières de 16 px.
  **« Hauteur utile » = la hauteur de la fenêtre moins la barre du haut** (le
  bouton « Quitter », le mode, la barre de progression et la série). Utilise
  `100dvh` et non `100vh` : sur Safari iOS, `vh` compte une barre d'adresse qui
  n'existe pas en mode plein écran, et le pavé se retrouverait coupé en bas.
- **Ordre 1-2-3 en haut**, comme le pavé du téléphone et celui d'iOS : c'est
  déjà automatisé chez un collégien.
- **Le 0 occupe deux colonnes**, au centre-bas. C'est le chiffre le plus tapé
  après un multiple de 10 ; il n'a pas à être visé.
- **Le ⌫ est isolé en bas à droite**, séparé par une **gouttière doublée de
  32 px** (`var(--pave-gouttiere-effacement)`), **posé en creux et jamais en
  rouge** : il ne doit ni attirer l'œil ni se prendre à la place du 0. Cette
  gouttière-là **ne se comprime jamais**, quelle que soit la taille de l'écran.
- **Planchers absolus** : une touche ne descend jamais sous **88 px de haut**
  et **96 px de large** (`--touche-h-min`, `--touche-l-min`).
- Largeur d'une touche = `(largeur de l'écran − 64 px de marges − 32 px de
  gouttières) ÷ 3`.

**Quand l'écran est plus court, voici l'ordre de compression**, du premier qui
cède au dernier :

1. les marges verticales de la carte question (34 → 20 px) ;
2. le chiffre de la question (116 → 88 px, jamais moins) ;
3. les cases de saisie (126 → 104 px) ;
4. la barre de série, qui passe en compteur seul.

**Le pavé ne bouge qu'en dernier recours.** Une erreur de frappe due à la mise
en page, c'est un calcul juste volé à un élève.

Une hypothèse reste à vérifier en classe : **la latéralité**. Un droitier
masque la colonne 3-6-9 avec sa main. Si l'observation le confirme, on ajoutera
une bascule gauche/droite du ⌫ dans le profil — ne l'anticipe pas.

---

## 5. La fête — trois intensités, jamais bloquantes

**1 · Bonne réponse (`var(--d-juste)`, 180 ms).** Les cases passent au vert, le
nombre grossit d'un cran, six carrés de la mosaïque jaillissent derrière la
carte. **La question suivante arrive pendant l'animation : rien n'attend.**

**2 · Série (aux paliers 5, 10, 15).** La barre de série se remplit d'un carré
coloré de plus ; au palier, la mosaïque pulse une fois et le compteur claque.
**Aucune modale.**

**3 · Fin de partie réussie, badge, table débloquée.** C'est là que ça pète :
pluie de carrés, score qui compte de 0 à sa valeur, badge qui se retourne. **Un
seul écran, une seule fois, uniquement en cas de réussite.**

**L'erreur reste sobre** : `var(--erreur-eleve)` + un tremblement de 200 ms,
puis les cases se vident. Pas de son, pas de croix géante. L'erreur d'un
collégien est une quasi-réussite, on ne la punit pas.

Respecte `prefers-reduced-motion` — `tokens.css` s'en charge déjà globalement.

---

## 6. Les icônes

La maquette contient **36 SVG dessinés à la main**. Reprends-les tels quels
(c'est le seul endroit où recopier la maquette est la bonne chose à faire) et
mets-les dans un composant par icône, ou dans un `<svg>` unique avec des
`<symbol>` — à ton choix. Ils remplacent les emojis des quatre modes et des
trois boutons du bas.

**Aucune bibliothèque d'icônes.** Le filtre MDM la bloquera.

**Les emojis restent** à trois endroits, et trois seulement : les **avatars**
des élèves (🦊 🐼 🐢 🐙 🦉 🐝 — ils existent déjà en base, colonne `avatar`), la
**couronne du podium** et le **badge**. Un avatar choisi dans une liste, c'est
une identité personnelle sans une lettre de texte libre — c'est exactement ce
qu'il nous faut.

---

## 7. Les écrans, un par un

Les 10 maquettes sont dans le `.dc.html`. Trois points méritent qu'on s'y
arrête, parce qu'ils corrigent des défauts réels.

### a) Le bandeau « défi en cours » ne promet plus rien de faux

Il disait « tu t'es arrêté à la question 6 ». **C'est impossible** : les
réponses déjà données ne sont stockées nulle part. L'élève recommence le défi
depuis le début — et c'est le bon comportement, sa première tentative n'a
jamais été enregistrée.

Le bandeau dit maintenant :

> ⚔️ **Défi UEWTR en cours** — Contre-la-montre · 6ᵉA
> *le défi reprend à la première question*

Cette dernière ligne n'est pas une donnée, c'est l'annonce du comportement.
L'élève doit le savoir **avant** de toucher le bouton.

### b) « Ma classe » n'a plus qu'une seule unité par colonne

Avant, la colonne de droite alternait « 18 bloquent » et « 78 % maîtrisé ». Or
*bloquent* compte des élèves sur les 27 de la classe, tandis que *% maîtrisé* ne
compte que ceux qui ont déjà travaillé la table. Deux dénominateurs différents,
alignés verticalement, invitent le professeur à les comparer — et il aura tort.

**Partout des élèves sur 27, jamais de pourcentage**, et le titre de la colonne
le dit en toutes lettres au-dessus des barres.

Rappel de la règle du projet : `maitrise_classe()` renvoie déjà
`eleves_verts`, `eleves_jaunes`, `eleves_rouges`, `eleves_sans_trace`,
`eleves_total` et `eleves_classe`. **Tu n'en déduis aucun**, tu les affiches.

### c) L'écran d'administration — c'est lui qui a déclenché la migration 24

Il est **en paysage** (1194 × 834), à rebours du portrait imposé partout
ailleurs. C'est délibéré : cet écran-là s'utilise sur un Mac, pas sur un iPad
tenu debout. Ne le force pas en portrait.

Et il est **sobre et dense** — tableaux serrés, pas de grosses cartes, aucune
animation. C'est l'opposé des écrans élèves, et c'est voulu.

---

## 8. L'import de rentrée — le point le plus important du lot

C'est la seule opération du projet où une erreur coûte une soirée : 350 lignes,
une colonne décalée, et personne ne s'en aperçoit avant que les élèves ne se
connectent.

**Le nouvel écran montre ce qui va se passer AVANT d'écrire quoi que ce soit.**
Pour ça, la migration 24 ajoute `apercu_import_eleves(p_eleves)` : mêmes
règles, mêmes compteurs, mêmes noms que `importer_eleves`, mais **elle n'écrit
rien** — on peut l'appeler autant de fois qu'on veut.

**Le déroulé :**

1. L'administrateur dépose son fichier. Tu le transformes en tableau JSON.
   **Mets un champ `ligne`** dans chaque objet, avec le numéro de ligne réel du
   CSV (en-tête comprise) : c'est ce numéro que le serveur te renverra, et
   c'est celui que l'administrateur cherchera dans son tableur. Sans lui, il
   cherchera la mauvaise ligne.
2. Tu appelles `apercu_import_eleves(lignes)` et tu affiches le résultat.
3. Le bouton d'import **n'est actif qu'après l'aperçu**, et il porte le nombre :
   « Importer 346 lignes ».
4. Au clic, `importer_eleves(lignes)` — **exactement le même tableau**. Si tu
   modifies le tableau entre les deux appels, l'aperçu devient un mensonge.

**Ce que l'aperçu renvoie :**

```
lignes_lues               le nombre de lignes du fichier
creations                 e-mails inconnus en base
mises_a_jour              e-mails connus (actifs ou non)
dont_reactivations        SOUS-ENSEMBLE de mises_a_jour : des élèves
                          désactivés qui redeviennent actifs
ignorees                  lignes rejetées
rattachables              lignes dont l'e-mail a déjà un compte Google
                          sans fiche — elles seront reliées à l'import
lignes_ignorees[]         { ligne, index, email, nom, prenom, classe,
                            statut:'ignoree', raison }
actifs_absents_du_fichier[]  élèves ACTIFS en base absents du fichier
```

**Trois règles d'affichage, et elles ne sont pas négociables :**

- `creations + mises_a_jour + ignorees = lignes_lues`. **Exactement.** C'est
  garanti par le serveur (cas de test 106). Tu affiches ces trois nombres, tu
  n'en calcules aucun.
- `dont_reactivations` **se lit à l'intérieur** de `mises_a_jour` — « 34 mises à
  jour, dont 3 réactivations ». Ne l'additionne jamais au reste ; le mot
  « dont » est dans le nom pour ça.
- `actifs_absents_du_fichier` porte sur la **base**, pas sur le fichier. C'est
  une autre population. **Jamais de fraction entre les deux.** Le message est :
  « 6 élèves actifs sont absents du fichier — **l'import ne désactive
  personne**. Ils resteront actifs, à traiter un par un. »

**Les raisons de rejet sont maintenant précises** — une par ligne, et elles
s'affichent telles quelles :

```
e-mail manquant
e-mail invalide — m.dupont.college
prenom manquant
nom manquant
classe vide
e-mail deja present ligne 88
```

Ce dernier cas est nouveau : **deux lignes du même fichier portant le même
e-mail** étaient traitées deux fois en silence, et comptées deux fois. La
seconde est désormais rejetée en nommant la ligne de la première.

**Enfin, écris ces deux phrases à l'écran, telles quelles :**

> *Rien n'a encore été écrit.*
> *L'import s'exécute d'un bloc : s'il échoue, aucune ligne n'est créée.*

Les deux sont vraies — `importer_eleves` est une seule fonction PL/pgSQL, donc
une seule transaction. Je l'ai vérifié dans le code, pas supposé.

---

## 9. Ce qu'il faut voir à l'écran

Coche-les un par un, c'est la recette de ce lot.

**Les fondations**

- [ ] Onglet Réseau : les deux `.woff2` partent de notre domaine, **zéro**
      requête vers Google, **zéro 404**.
- [ ] `grep -rn "#[0-9a-fA-F]\{6\}" frontend/src` ne renvoie plus que
      `tokens.css`.
- [ ] Aucun `:hover` dans le CSS de l'application.

**La partie**

- [ ] Sur un iPad tenu en portrait, le pavé occupe le bas et les touches font
      plus de 88 px de haut. Rétrécis la fenêtre : c'est la question qui cède,
      pas le pavé.
- [ ] La gouttière du ⌫ reste doublée même à l'étroit.
- [ ] Bonne réponse : vert, +1, mosaïque — **et la question suivante arrive
      sans attendre la fin de l'animation**.
- [ ] Mauvaise réponse : rouge doux, tremblement, cases vidées. Pas de modale.
- [ ] La barre de compte à rebours par question est visible et se vide.

**Les écrans**

- [ ] Le bandeau de reprise dit « le défi reprend à la première question » et
      ne mentionne aucun numéro de question.
- [ ] « Ma classe » : une seule unité dans la colonne de droite, et le titre de
      colonne l'annonce.
- [ ] Le podium : la 1ʳᵉ marche en `var(--podium)`, tout le reste sans or.

**L'import** — c'est le morceau à tester le plus sérieusement

- [ ] Un fichier propre : l'aperçu annonce N créations, l'import en fait
      exactement N.
- [ ] Un fichier avec une ligne sans « @ », une sans prénom, une sans classe :
      trois raisons **différentes**, avec le bon numéro de ligne.
- [ ] Le même e-mail sur deux lignes : la seconde est rejetée en nommant la
      première, et l'élève n'est créé **qu'une fois**.
- [ ] Un élève désactivé présent dans le fichier : l'aperçu annonce
      « dont 1 réactivation », et il redevient actif après l'import.
- [ ] `créations + mises à jour + ignorées` égale toujours le nombre de lignes
      affiché.
- [ ] Tant qu'on n'a pas cliqué : **rien n'est écrit en base**. Vérifie-le en
      comptant les élèves avant et après l'aperçu.

---

## Deux points d'étape, pas un seul rapport à la fin

Ce lot est trop gros pour être relu d'un bloc. Commite et pousse à la fin de
chaque section, et fais un point à deux moments :

- **après la section 2** (migration, polices, tokens) : c'est visible tout de
  suite à l'écran, et si la palette part de travers tout le reste part avec ;
- **après la section 8** (l'import), avant la recette.

À chaque point, dis ce qui est fait, ce qui a résisté, et ce que tu as dû
décider seul.

## Ce que tu ne changes pas

- La logique métier. Aucun appel RPC n'est ajouté ni retiré, sauf
  `apercu_import_eleves` qui est nouveau.
- La navigation entre les écrans.
- Le contenu des textes, sauf ceux que ce message cite explicitement.

Et si une maquette te paraît contredire ce que le serveur renvoie : **c'est le
serveur qui a raison**, et tu le signales plutôt que de le contourner.
