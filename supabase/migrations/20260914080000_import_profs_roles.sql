-- =====================================================================
-- Calcul Mental Saintho
-- Migration 43 : l'import d'enseignants ne touche jamais aux rôles
-- =====================================================================
-- Constaté par exécution le 14 septembre, cas de test 208 :
-- `valider_lignes_import_profs` remplaçait un rôle ABSENT par 'prof'.
-- Un export d'annuaire Charlemagne (email, nom, prénom) valait donc
-- « rétrograde tout le monde » : deux administrateurs avant l'import,
-- UN après — et c'est celui qui lance l'import qui perdait ses droits,
-- avec un retour `"ok": true` ne mentionnant aucun changement de rôle.
-- Le verrou existant ne protégeait que le DERNIER administrateur actif.
--
-- LA RÈGLE, tranchée par Aymeri le 14 septembre :
--   1. Un rôle absent (ou vide, ou inconnu) n'est pas un rôle : c'est
--      l'absence d'instruction. C'est la règle déjà écrite au lot 16 bis
--      — « une réponse absente n'est pas une valeur ».
--   2. Un import CSV est un outil de synchronisation en masse. La
--      gestion des rôles administrateurs reste un acte NOMINATIF, dans
--      l'écran de modification dédié — la même règle que le `!estMoi`
--      de `ModalModifierProf`, qui interdit déjà à un administrateur de
--      se modifier lui-même.
--
-- CE QUE ÇA DONNE :
--   · création  → rôle 'prof', toujours.
--   · mise à jour ou réactivation → le rôle EN BASE est conservé, quoi
--     que dise le fichier. Ni rétrogradation, ni promotion.
--   · et ce n'est jamais silencieux : chaque ligne dont le fichier
--     demandait un rôle différent de celui appliqué est comptée dans
--     `roles_ignores` et listée dans `lignes_role_ignore`, à l'aperçu
--     comme au retour de l'import.
--
-- Le point 2 vaut aussi pour la PROMOTION : un fichier Excel qui
-- fabrique des administrateurs est un défaut plus grave que celui qui
-- en retire. Une ligne `"role":"admin"` ne nomme donc personne — elle
-- est comptée et affichée, et l'écran Modifier reste le seul chemin.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VALIDATION : le rôle appliqué, et ce que le fichier demandait
-- ---------------------------------------------------------------------
create or replace function public.valider_lignes_import_profs(p_profs jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res      jsonb := '[]';
  p          jsonb;
  v_idx      int := 0;
  v_ligne    int;
  v_email    text;
  v_nom      text;
  v_role     text;
  v_statut   text;
  v_raison   text;
  v_existe   boolean;
  v_actif    boolean;
  v_ancien_role text;
  v_vus      jsonb := '{}';
  v_rattach  boolean;
  v_brut     text;
  v_role_fichier text;
  v_role_ignore  boolean;
begin
  if jsonb_typeof(p_profs) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  for p in select * from jsonb_array_elements(p_profs) loop
    v_idx    := v_idx + 1;
    v_brut   := p->>'ligne';
    v_ligne  := case when v_brut ~ '^[0-9]+$' then v_brut::int else v_idx end;
    v_email  := lower(trim(coalesce(p->>'email', '')));
    v_nom    := trim(coalesce(p->>'nom', ''));
    if v_nom = '' and p->>'prenom' is not null then
      v_nom := trim(coalesce(p->>'prenom', ''));
    elsif p->>'prenom' is not null and trim(p->>'prenom') <> '' and trim(p->>'nom') <> '' then
      v_nom := trim(p->>'prenom') || ' ' || trim(p->>'nom');
    end if;

    -- Ce que le FICHIER demande — null s'il ne demande rien, ou demande
    -- quelque chose qu'on ne sait pas lire. Un rôle inconnu est traité
    -- comme une absence d'instruction, jamais comme une rétrogradation.
    v_role_fichier := nullif(lower(trim(coalesce(p->>'role', ''))), '');
    if v_role_fichier is not null and v_role_fichier not in ('prof', 'admin') then
      v_role_fichier := null;
    end if;

    v_statut := null;
    v_raison := null;
    v_rattach := false;
    v_existe := null;
    v_actif  := null;
    v_ancien_role := null;
    v_role   := null;
    v_role_ignore := false;

    if v_email = '' then
      v_raison := 'e-mail manquant';
    elsif v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_raison := 'e-mail invalide — ' || v_email;
    elsif v_nom = '' then
      v_raison := 'nom manquant';
    elsif jsonb_exists(v_vus, v_email) then
      v_raison := 'e-mail deja present ligne ' || (v_vus->>v_email);
    end if;

    if v_raison is not null then
      v_statut := 'ignoree';
      v_role   := coalesce(v_role_fichier, 'prof');
    else
      v_vus := v_vus || jsonb_build_object(v_email, v_ligne::text);

      select true, actif, role into v_existe, v_actif, v_ancien_role
        from public.profs where lower(email) = v_email;

      if not coalesce(v_existe, false) then
        v_statut := 'creation';
        -- Une création vaut 'prof'. Nommer un administrateur est un
        -- acte nominatif, il ne sort pas d'un fichier.
        v_role := 'prof';
        v_role_ignore := (v_role_fichier = 'admin');
      else
        if not coalesce(v_actif, true) then
          v_statut := 'reactivation';
        else
          v_statut := 'mise_a_jour';
        end if;
        -- Le rôle en base est conservé, quoi que dise le fichier.
        v_role := v_ancien_role;
        v_role_ignore := (v_role_fichier is not null and v_role_fichier <> v_ancien_role);
      end if;

      select exists (
        select 1 from auth.users u
         where lower(u.email) = v_email
           and not exists (select 1 from public.profs x where x.user_id = u.id)
           and not exists (select 1 from public.eleves e where e.user_id = u.id)
      ) into v_rattach;
    end if;

    v_res := v_res || jsonb_build_object(
      'index',        v_idx,
      'ligne',        v_ligne,
      'email',        v_email,
      'nom',          v_nom,
      'role',         v_role,
      'role_fichier', v_role_fichier,
      'role_ignore',  coalesce(v_role_ignore, false),
      'statut',       v_statut,
      'raison',       v_raison,
      'rattachable',  v_rattach
    );
  end loop;

  return v_res;
end;
$$;

comment on function public.valider_lignes_import_profs(jsonb) is
  'Règles de validation partagées par l''aperçu et l''import des enseignants. `role` est le rôle qui sera APPLIQUÉ : ''prof'' pour une création, le rôle déjà en base pour une mise à jour. `role_fichier` est ce que le fichier demandait, `role_ignore` dit que les deux diffèrent. Un import ne change jamais un rôle : c''est un acte nominatif, réservé à l''écran Modifier (migration 43).';

revoke all on function public.valider_lignes_import_profs(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. APERÇU : dire ce qui sera ignoré AVANT d'écrire
-- ---------------------------------------------------------------------
create or replace function public.apercu_import_profs(p_profs jsonb)
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

  v_lignes := public.valider_lignes_import_profs(p_profs);

  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'role', role)
           order by nom), '[]')
    into v_absents
    from public.profs
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_profs) x
        where x->>'email' is not null);

  return jsonb_build_object(
    'lignes_lues',        jsonb_array_length(p_profs),
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
    'roles_ignores',      (select count(*) from jsonb_array_elements(v_lignes) l
                            where (l->>'role_ignore')::boolean),
    'lignes_role_ignore', (select coalesce(jsonb_agg(jsonb_build_object(
                                    'ligne', l->'ligne', 'email', l->>'email',
                                    'role_demande', l->>'role_fichier',
                                    'role_conserve', l->>'role')
                                    order by (l->>'index')::int), '[]')
                             from jsonb_array_elements(v_lignes) l
                            where (l->>'role_ignore')::boolean),
    'lignes_ignorees',    (select coalesce(jsonb_agg(l order by (l->>'index')::int), '[]')
                             from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.apercu_import_profs(jsonb) is
  'Ce que le fichier de professeurs produirait. N''ecrit rien. Reserve a l''administrateur. `roles_ignores` et `lignes_role_ignore` nomment les lignes dont le role demande ne sera pas applique : un import ne change jamais un role (migration 43).';

grant execute on function public.apercu_import_profs(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. IMPORT : on ne touche plus jamais à la colonne `role`
-- ---------------------------------------------------------------------
create or replace function public.importer_profs(p_profs jsonb)
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
  v_roles_ign  int := 0;
  v_ignores    jsonb := '[]';
  v_roles      jsonb := '[]';
  v_absents    jsonb;
  v_lignes     jsonb;
  l            jsonb;
  v_email      text;
  v_nom        text;
  v_statut     text;
  v_prof_id    uuid;
  v_uid        uuid;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_profs) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  v_lignes := public.valider_lignes_import_profs(p_profs);

  for l in select * from jsonb_array_elements(v_lignes) loop
    v_statut := l->>'statut';
    v_email  := l->>'email';
    v_nom    := l->>'nom';

    if coalesce((l->>'role_ignore')::boolean, false) then
      v_roles_ign := v_roles_ign + 1;
      v_roles := v_roles || jsonb_build_object(
        'ligne', l->'ligne', 'email', v_email,
        'role_demande', l->>'role_fichier', 'role_conserve', l->>'role');
    end if;

    if v_statut = 'ignoree' then
      v_ignores := v_ignores || jsonb_build_object(
        'ligne', l->'ligne', 'email', v_email, 'raison', l->>'raison');

    elsif v_statut = 'creation' then
      -- `role` vaut 'prof' : la validation l'a déjà tranché.
      insert into public.profs (email, nom, role, actif)
      values (v_email, v_nom, coalesce(l->>'role', 'prof'), true)
      returning id into v_prof_id;
      v_crees := v_crees + 1;

      -- Si un compte auth.users existe deja, rattachement immediat
      v_uid := public.rattacher_par_email(v_email);
      if v_uid is not null then
        v_rattaches := v_rattaches + 1;
      end if;

    elsif v_statut in ('mise_a_jour', 'reactivation') then
      -- La colonne `role` n'est PAS dans le `set` : c'est tout le
      -- correctif. Le verrou « dernier admin » de la migration 42 a
      -- disparu avec elle — il ne protégeait qu'un seul administrateur,
      -- et il n'a plus rien à protéger.
      update public.profs
         set nom   = v_nom,
             actif = true
       where lower(email) = v_email;

      if v_statut = 'reactivation' then
        v_reac := v_reac + 1;
      end if;
      v_maj := v_maj + 1;

      -- Tentative de rattachement si user_id est null
      if exists (select 1 from public.profs where lower(email) = v_email and user_id is null) then
        v_uid := public.rattacher_par_email(v_email);
        if v_uid is not null then
          v_rattaches := v_rattaches + 1;
        end if;
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'role', role)
           order by nom), '[]')
    into v_absents
    from public.profs
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_profs) x
        where x->>'email' is not null);

  perform public.journaliser(
    'import_profs',
    format('%s ligne(s) traitee(s)', jsonb_array_length(p_profs)),
    jsonb_build_object(
      'crees', v_crees,
      'mis_a_jour', v_maj,
      'dont_reactivations', v_reac,
      'rattaches', v_rattaches,
      'roles_ignores', v_roles_ign,
      'ignores', jsonb_array_length(v_ignores)
    )
  );

  return jsonb_build_object(
    'ok',                        true,
    'crees',                     v_crees,
    'mis_a_jour',                v_maj,
    'dont_reactivations',        v_reac,
    'rattaches',                 v_rattaches,
    'roles_ignores',             v_roles_ign,
    'lignes_role_ignore',        v_roles,
    'lignes_ignorees',           v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_profs(jsonb) is
  'Import de masse des enseignants. Cree, met a jour, reactive, rattache les comptes Google, trace au journal. NE CHANGE JAMAIS UN ROLE : une creation vaut ''prof'', une mise a jour garde le role en base, et les lignes dont le fichier demandait autre chose sont comptees dans `roles_ignores` et listees dans `lignes_role_ignore` (migration 43). Ne desactive personne automatiquement.';

grant execute on function public.importer_profs(jsonb) to authenticated;
