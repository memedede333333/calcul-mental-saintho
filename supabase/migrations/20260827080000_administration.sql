-- =====================================================================
-- Calcul Mental Saintho
-- Migration 7 : administration des élèves
-- =====================================================================
--
-- Ce qui manquait : la vie courante d'un fichier d'élèves dans un
-- établissement. L'import de rentrée existait dans le brief mais pas
-- dans le code, et tout le reste n'était nulle part :
--
--   · un élève arrive en novembre           → ajouter_eleve()
--   · une adresse est mal orthographiee      → modifier_eleve()
--   · un élève part au 2e trimestre          → desactiver_eleve()
--   · il revient, ou c'était une erreur      → reactiver_eleve()
--   · une classe passe aux tables de 12      → definir_plafond_classe()
--   · qui n'a jamais réussi à se connecter ? → eleves_sans_connexion()
--
-- Deux principes de conception :
--
-- 1. ON NE SUPPRIME JAMAIS UN ELEVE en cours d'année. On le désactive.
--    Supprimer ferait disparaître ses sessions par cascade, ce qui
--    fausserait rétroactivement tous les classements de sa classe et
--    l'historique des défis auxquels il a participé. La suppression
--    définitive appartient à la fin de scolarité (RGPD), pas à la
--    gestion courante.
--
-- 2. TOUT EST TRACE. Plusieurs enseignants auront les droits ; il faut
--    pouvoir répondre à « qui a désactivé cet élève, et quand ? ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- JOURNAL D'ADMINISTRATION
-- ---------------------------------------------------------------------
create table public.journal_admin (
  id           bigserial primary key,
  acteur_email text not null,
  action       text not null,
  cible        text,
  detail       jsonb not null default '{}',
  fait_le      timestamptz not null default now()
);

create index journal_admin_date_idx on public.journal_admin (fait_le desc);
create index journal_admin_cible_idx on public.journal_admin (cible);

alter table public.journal_admin enable row level security;
grant select on public.journal_admin to authenticated;

create policy journal_lecture_prof on public.journal_admin
  for select to authenticated using (public.est_prof());

-- Aucune politique d'écriture : seules les fonctions ci-dessous écrivent.

create or replace function public.journaliser(
  p_action text, p_cible text, p_detail jsonb default '{}')
returns void
language sql security definer set search_path = public
as $$
  insert into public.journal_admin (acteur_email, action, cible, detail)
  values (coalesce(
            (select email from public.profs where user_id = auth.uid()),
            (select email from public.eleves where user_id = auth.uid()),
            'inconnu'),
          p_action, p_cible, p_detail);
$$;

-- ---------------------------------------------------------------------
-- Plafond de tables par défaut, déduit du niveau
-- ---------------------------------------------------------------------
create or replace function public.plafond_par_defaut(p_classe text)
returns smallint
language sql immutable
as $$
  select case substring(coalesce(p_classe,'') from '^[0-9]')
           when '6' then 10
           when '5' then 12
           when '4' then 15
           when '3' then 15
           else 10
         end::smallint;
$$;

-- ---------------------------------------------------------------------
-- Le prof peut-il administrer cette classe ?
-- Un admin peut tout ; un prof, seulement ses classes.
-- ---------------------------------------------------------------------
create or replace function public.peut_administrer_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_admin() or public.prof_voit_classe(p_classe);
$$;

-- =====================================================================
-- IMPORT DE RENTREE
-- Reçoit un tableau JSON : [{"email","nom","prenom","classe"}, ...]
--
-- Comportement volontairement PRUDENT :
--   · élève présent dans le fichier   → créé, ou mis à jour et réactivé
--   · élève ABSENT du fichier         → laissé tel quel, JAMAIS désactivé
--
-- Désactiver en masse sur la foi d'un fichier serait le meilleur moyen
-- de couper l'accès à tout un niveau parce qu'un export s'est mal passé.
-- La fonction renvoie donc la liste des élèves actifs absents du
-- fichier : à l'administrateur de décider quoi en faire.
-- =====================================================================
create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_ignores    jsonb := '[]';
  v_absents    jsonb;
  e            jsonb;
  v_email      text;
  v_existe     boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  if jsonb_typeof(p_eleves) <> 'array' then
    raise exception 'Le format attendu est un tableau JSON';
  end if;

  for e in select * from jsonb_array_elements(p_eleves) loop
    v_email := lower(trim(e->>'email'));

    -- Lignes inexploitables : on les signale plutôt que de les avaler
    if v_email is null or v_email = ''
       or e->>'nom' is null or e->>'prenom' is null or e->>'classe' is null
       or v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      v_ignores := v_ignores || jsonb_build_object(
        'ligne', e, 'raison', 'email invalide ou champ manquant');
      continue;
    end if;

    select true into v_existe from public.eleves where lower(email) = v_email;

    if v_existe then
      update public.eleves
         set nom    = e->>'nom',
             prenom = e->>'prenom',
             classe = e->>'classe',
             actif  = true
       where lower(email) = v_email;
      v_maj := v_maj + 1;
    else
      insert into public.eleves (email, nom, prenom, classe, plafond_tables)
      values (v_email, e->>'nom', e->>'prenom', e->>'classe',
              public.plafond_par_defaut(e->>'classe'));
      v_crees := v_crees + 1;
    end if;
    v_existe := null;
  end loop;

  -- Qui est actif en base mais absent du fichier ?
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', email, 'nom', nom, 'prenom', prenom, 'classe', classe)), '[]')
    into v_absents
    from public.eleves
   where actif
     and lower(email) not in (
       select lower(trim(x->>'email')) from jsonb_array_elements(p_eleves) x
        where x->>'email' is not null);

  perform public.journaliser('import_eleves', null, jsonb_build_object(
    'crees', v_crees, 'mis_a_jour', v_maj,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

-- =====================================================================
-- AJOUT A L'UNITE — l'élève qui arrive en cours d'année
-- Accessible aussi au professeur, pour ses classes : sinon tout passe
-- par l'administrateur et l'élève attend.
-- =====================================================================
create or replace function public.ajouter_eleve(
  p_email  text,
  p_nom    text,
  p_prenom text,
  p_classe text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_actif boolean;
begin
  if not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux ajouter un eleve que dans tes classes'
      using errcode = '42501';
  end if;

  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id, actif into v_id, v_actif
    from public.eleves where lower(email) = v_email;

  if v_id is not null then
    if v_actif then
      return jsonb_build_object('ok', false, 'raison', 'existe_deja',
        'message', 'Cet eleve existe deja et il est actif.', 'eleve_id', v_id);
    end if;
    update public.eleves
       set actif = true, nom = p_nom, prenom = p_prenom, classe = p_classe
     where id = v_id;
    perform public.journaliser('reactivation_via_ajout', v_email, '{}');
    return jsonb_build_object('ok', true, 'reactive', true, 'eleve_id', v_id,
      'message', 'Cet eleve existait deja, desactive. Il a ete reactive.');
  end if;

  insert into public.eleves (email, nom, prenom, classe, plafond_tables)
  values (v_email, p_nom, p_prenom, p_classe, public.plafond_par_defaut(p_classe))
  returning id into v_id;

  perform public.journaliser('ajout_eleve', v_email,
    jsonb_build_object('classe', p_classe));

  return jsonb_build_object('ok', true, 'reactive', false, 'eleve_id', v_id,
    'message', 'Eleve ajoute. Il peut se connecter immediatement.');
end;
$$;

-- =====================================================================
-- CORRECTION D'UNE FICHE
--
-- ⚠️ L'adresse e-mail ne peut être corrigée QUE si l'élève ne s'est
-- jamais connecté. Une fois le compte rattaché, changer l'adresse
-- laisserait l'élève connecté sous une identité qui n'existe plus, et
-- les codes partiraient à la mauvaise boîte. Dans ce cas : désactiver
-- l'ancienne fiche, en créer une nouvelle.
-- =====================================================================
create or replace function public.modifier_eleve(
  p_eleve_id uuid,
  p_email    text default null,
  p_nom      text default null,
  p_prenom   text default null,
  p_classe   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien public.eleves%rowtype;
  v_email  text := lower(trim(p_email));
begin
  select * into v_ancien from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;

  if not public.peut_administrer_classe(v_ancien.classe) then
    raise exception 'Tu ne peux modifier que les eleves de tes classes'
      using errcode = '42501';
  end if;

  if p_classe is not null and not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux pas deplacer un eleve vers une classe qui n''est pas la tienne'
      using errcode = '42501';
  end if;

  if p_email is not null and v_email <> lower(v_ancien.email) then
    if v_ancien.user_id is not null then
      raise exception 'Impossible : cet eleve s''est deja connecte. Desactive cette fiche et cree-en une nouvelle.';
    end if;
    if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      raise exception 'Adresse e-mail invalide : %', p_email;
    end if;
  end if;

  update public.eleves
     set email  = coalesce(v_email, email),
         nom    = coalesce(p_nom, nom),
         prenom = coalesce(p_prenom, prenom),
         classe = coalesce(p_classe, classe),
         plafond_tables = case
           when p_classe is not null and p_classe <> v_ancien.classe
                and plafond_tables = public.plafond_par_defaut(v_ancien.classe)
           then public.plafond_par_defaut(p_classe)
           else plafond_tables end
   where id = p_eleve_id;

  perform public.journaliser('modification_eleve', v_ancien.email,
    jsonb_build_object('avant', jsonb_build_object(
      'email', v_ancien.email, 'nom', v_ancien.nom,
      'prenom', v_ancien.prenom, 'classe', v_ancien.classe)));

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- DEPART ET RETOUR
-- =====================================================================
create or replace function public.desactiver_eleve(p_eleve_id uuid, p_motif text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_e public.eleves%rowtype;
begin
  select * into v_e from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;
  if not public.peut_administrer_classe(v_e.classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;

  update public.eleves set actif = false where id = p_eleve_id;
  perform public.journaliser('desactivation', v_e.email,
    jsonb_build_object('motif', p_motif, 'classe', v_e.classe));

  return jsonb_build_object('ok', true,
    'message', 'Eleve desactive. Ses resultats sont conserves.');
end;
$$;

create or replace function public.reactiver_eleve(p_eleve_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_e public.eleves%rowtype;
begin
  select * into v_e from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;
  if not public.peut_administrer_classe(v_e.classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;

  update public.eleves set actif = true where id = p_eleve_id;
  perform public.journaliser('reactivation', v_e.email, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- PLAFOND DE TABLES D'UNE CLASSE
-- « Mes 5e sont prets pour les tables jusqu'a 12 » — une seule action.
-- Ne redescend jamais le plafond d'un eleve qui a debloque plus haut
-- par la Montee des tables : ce serait lui retirer ce qu'il a gagne.
-- =====================================================================
create or replace function public.definir_plafond_classe(
  p_classe text, p_plafond smallint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.peut_administrer_classe(p_classe) then
    raise exception 'Reserve aux enseignants de cette classe' using errcode = '42501';
  end if;
  if p_plafond < 5 or p_plafond > 20 then
    raise exception 'Le plafond doit etre compris entre 5 et 20';
  end if;

  update public.eleves
     set plafond_tables = greatest(plafond_tables, p_plafond)
   where classe = p_classe and actif and plafond_tables < p_plafond;
  get diagnostics v_n = row_count;

  perform public.journaliser('plafond_classe', p_classe,
    jsonb_build_object('plafond', p_plafond, 'eleves_modifies', v_n));

  return jsonb_build_object('ok', true, 'eleves_modifies', v_n,
    'message', v_n || ' eleve(s) peuvent desormais aller jusqu''a la table ' || p_plafond);
end;
$$;

-- =====================================================================
-- SUIVI DE RENTREE
-- Qui n'a jamais reussi a se connecter ? La question qu'on se pose
-- pendant les deux premieres semaines, et qui evite de decouvrir en
-- decembre que six eleves n'ont jamais ouvert leur boite scolaire.
-- =====================================================================
create or replace function public.eleves_sans_connexion(p_classe text default null)
returns table (
  eleve_id uuid, email text, nom text, prenom text, classe text, cree_le timestamptz
)
language sql security definer set search_path = public
as $$
  select e.id, e.email, e.nom, e.prenom, e.classe, e.cree_le
    from public.eleves e
   where e.actif
     and e.user_id is null
     and (p_classe is null or e.classe = p_classe)
     and public.peut_administrer_classe(e.classe)
   order by e.classe, e.nom, e.prenom;
$$;

grant execute on function
  public.plafond_par_defaut(text),
  public.peut_administrer_classe(text),
  public.importer_eleves(jsonb),
  public.ajouter_eleve(text, text, text, text),
  public.modifier_eleve(uuid, text, text, text, text),
  public.desactiver_eleve(uuid, text),
  public.reactiver_eleve(uuid),
  public.definir_plafond_classe(text, smallint),
  public.eleves_sans_connexion(text)
to authenticated;
