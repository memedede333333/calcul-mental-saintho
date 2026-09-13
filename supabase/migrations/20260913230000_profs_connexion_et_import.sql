-- =====================================================================
-- Calcul Mental Saintho
-- Migration 42 : Statut de connexion des enseignants et import CSV profs
-- =====================================================================
-- 1. `liste_profs` enrichie avec `derniere_connexion` (depuis auth.users)
-- 2. `valider_lignes_import_profs`, `apercu_import_profs` et `importer_profs`
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LISTE DES ENSEIGNANTS AVEC DATE DE DERNIÈRE CONNEXION
-- ---------------------------------------------------------------------
drop function if exists public.liste_profs();

create or replace function public.liste_profs()
returns table (
  prof_id            uuid,
  email              text,
  nom                text,
  role               text,
  classes            text[],
  actif              boolean,
  connecte           boolean,
  derniere_connexion timestamptz
)
language sql security definer set search_path = public
as $$
  select p.id, p.email, p.nom, p.role, p.classes, p.actif,
         p.user_id is not null as connecte,
         u.last_sign_in_at     as derniere_connexion
    from public.profs p
    left join auth.users u on u.id = p.user_id
   where public.est_prof()
   order by p.actif desc, p.role, p.nom;
$$;

comment on function public.liste_profs() is
  'La liste des enseignants pour l''écran Administration. Renvoie le rôle, si le compte Google est rattaché (connecte), et la date/heure de dernière connexion Google (derniere_connexion) lue depuis auth.users. Réservé aux enseignants.';

grant execute on function public.liste_profs() to authenticated;


-- ---------------------------------------------------------------------
-- 2. VALIDATION DES LIGNES D'IMPORT PROFESSEURS
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

    v_role   := lower(trim(coalesce(p->>'role', 'prof')));
    if v_role not in ('prof', 'admin') then
      v_role := 'prof';
    end if;

    v_statut := null;
    v_raison := null;
    v_rattach := false;
    v_existe := null;
    v_actif  := null;

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
    else
      v_vus := v_vus || jsonb_build_object(v_email, v_ligne::text);

      select true, actif, role into v_existe, v_actif, v_ancien_role
        from public.profs where lower(email) = v_email;

      if not coalesce(v_existe, false) then
        v_statut := 'creation';
      elsif not coalesce(v_actif, true) then
        v_statut := 'reactivation';
      else
        v_statut := 'mise_a_jour';
      end if;

      select exists (
        select 1 from auth.users u
         where lower(u.email) = v_email
           and not exists (select 1 from public.profs x where x.user_id = u.id)
           and not exists (select 1 from public.eleves e where e.user_id = u.id)
      ) into v_rattach;
    end if;

    v_res := v_res || jsonb_build_object(
      'index',       v_idx,
      'ligne',       v_ligne,
      'email',       v_email,
      'nom',         v_nom,
      'role',        v_role,
      'statut',      v_statut,
      'raison',      v_raison,
      'rattachable', v_rattach
    );
  end loop;

  return v_res;
end;
$$;

revoke all on function public.valider_lignes_import_profs(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. APERÇU DE L'IMPORT PROFESSEURS
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
    'lignes_ignorees',    (select coalesce(jsonb_agg(l order by (l->>'index')::int), '[]')
                             from jsonb_array_elements(v_lignes) l
                            where l->>'statut' = 'ignoree'),
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.apercu_import_profs(jsonb) is
  'Ce que le fichier de professeurs produirait. N''ecrit rien. Reserve a l''administrateur.';

grant execute on function public.apercu_import_profs(jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 4. IMPORTER LES PROFESSEURS
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
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  v_lignes     jsonb;
  l            jsonb;
  v_email      text;
  v_nom        text;
  v_role       text;
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
    v_role   := coalesce(l->>'role', 'prof');

    if v_statut = 'ignoree' then
      v_ignores := v_ignores || jsonb_build_object(
        'ligne', l->'ligne', 'email', v_email, 'raison', l->>'raison');
    elsif v_statut = 'creation' then
      insert into public.profs (email, nom, role, actif)
      values (v_email, v_nom, v_role, true)
      returning id into v_prof_id;
      v_crees := v_crees + 1;

      -- Si un compte auth.users existe deja, rattachement immediat
      v_uid := public.rattacher_par_email(v_email);
      if v_uid is not null then
        v_rattaches := v_rattaches + 1;
      end if;

    elsif v_statut in ('mise_a_jour', 'reactivation') then
      -- Garde-fou dernier admin
      if v_role = 'prof' and exists (
        select 1 from public.profs p
         where lower(p.email) = v_email and p.role = 'admin'
           and (select count(*) from public.profs where role = 'admin' and actif) <= 1
      ) then
        v_role := 'admin';
      end if;

      update public.profs
         set nom   = v_nom,
             role  = v_role,
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
      'ignores', jsonb_array_length(v_ignores)
    )
  );

  return jsonb_build_object(
    'ok',                        true,
    'crees',                     v_crees,
    'mis_a_jour',                v_maj,
    'dont_reactivations',        v_reac,
    'rattaches',                 v_rattaches,
    'lignes_ignorees',           v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_profs(jsonb) is
  'Import de masse des enseignants. Statuts : creations, mises_a_jour, dont_reactivations, rattaches. Ne retrograde jamais le dernier admin actif et ne desactive personne automatiquement. Trace dans journal_admin.';

grant execute on function public.importer_profs(jsonb) to authenticated;
