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
