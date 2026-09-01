-- =====================================================================
-- Calcul Mental Saintho
-- Migration 22 : le rattachement ne peut plus arriver trop tard
-- =====================================================================
--
-- CONSTAT (1er septembre 2026, remonte par Aymeri, reproduit en base)
--
-- Une eleve ajoutee depuis l'ecran Administration apparait bien dans la
-- liste, et se voit pourtant refuser l'acces sur son iPad :
-- « Ce compte n'est pas reconnu. Demande a ton professeur. »
--
-- CAUSE
--
-- `eleves.user_id` n'est renseigne QUE par le trigger
-- `on_auth_user_created`, qui se declenche a la CREATION du compte
-- Supabase Auth — c'est-a-dire a la toute premiere connexion Google de
-- la personne. Le trigger cherche alors son adresse dans `eleves` et
-- dans `profs`.
--
-- Si la personne s'est connectee AVANT que sa fiche existe, le trigger
-- n'a rien trouve, et plus rien ne le rattrape ensuite : creer la fiche
-- apres coup ne renseigne pas `user_id`. Or toutes les politiques RLS et
-- `eleve_courant()` reposent sur `user_id = auth.uid()`. L'eleve reste
-- donc bloquee POUR TOUJOURS, sans que rien ne le signale — sa fiche est
-- normale a l'ecran.
--
-- Reproduit sur base neuve :
--
--   fiche creee AVANT le compte Google  -> qui_suis_je() = 'eleve'
--   compte Google cree AVANT la fiche   -> qui_suis_je() = 'inconnu'
--                                          eleves.user_id = null
--
-- POURQUOI CELA COMPTE MAINTENANT
--
-- A la rentree, 350 eleves sont importes d'un coup. Il suffit qu'un
-- eleve ait ouvert l'application une fois avant l'import — par
-- curiosite, parce qu'un camarade lui a montre, parce qu'une classe a
-- ete testee avant les autres — pour qu'il soit ecarte definitivement.
-- Et l'echelonnement de la rentree, prevu classe par classe, rend ce
-- cas probable plutot qu'exceptionnel.
--
-- LE CORRECTIF
--
-- On arrete de dependre d'un evenement unique. Le rattachement devient
-- une operation qu'on peut REJOUER, et on la rejoue a chaque fois qu'une
-- adresse entre dans le systeme :
--
--   * `rattacher_par_email()` — helper interne, non expose au client :
--     rattache une fiche a un compte Auth existant, si et seulement si
--     ce compte n'appartient encore a personne.
--   * `ajouter_eleve`, `importer_eleves` et `modifier_eleve` l'appellent.
--   * `reparer_rattachements()` — reserve a l'administrateur, rejouable
--     a volonte, pour les fiches deja creees. C'est le bouton a actionner
--     apres chaque import de rentree.
--   * Et une passe de reparation immediate, ci-dessous, qui debloque les
--     fiches actuellement orphelines — dont celle qui a revele le defaut.
--
-- CE QUI NE CHANGE PAS
--
-- La barriere d'entree tient : un compte Google dont l'adresse n'est
-- dans aucune table n'obtient toujours rien. Et un compte Auth deja
-- rattache a quelqu'un ne peut pas etre repris par une autre fiche —
-- c'est la condition `not exists` ci-dessous, sans laquelle une fiche
-- creee avec l'adresse d'un administrateur lui volerait son compte.
--
-- NUMEROTATION : 20260901170000, l'heure reelle d'ecriture. La dette
-- laissee par la 19 (datee dans le futur) est resorbee : il est 17 h.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Le helper — interne, jamais expose a un client
-- ---------------------------------------------------------------------
create or replace function public.rattacher_par_email(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_uid   uuid;
begin
  if v_email is null or v_email = '' then
    return null;
  end if;

  -- Le compte Auth doit exister ET n'appartenir a personne. Sans cette
  -- seconde condition, creer une fiche avec l'adresse d'un collegue
  -- deja inscrit lui prendrait son compte.
  select u.id into v_uid
    from auth.users u
   where lower(u.email) = v_email
     and not exists (select 1 from public.eleves e where e.user_id = u.id)
     and not exists (select 1 from public.profs  p where p.user_id = u.id)
   limit 1;

  if v_uid is null then
    return null;
  end if;

  -- Meme signal que le trigger : c'est un rattachement systeme, pas une
  -- modification de fiche par un eleve.
  perform set_config('app.rattachement_en_cours', 'on', true);

  update public.eleves set user_id = v_uid
   where lower(email) = v_email and user_id is null;

  update public.profs  set user_id = v_uid
   where lower(email) = v_email and user_id is null;

  perform set_config('app.rattachement_en_cours', 'off', true);

  return v_uid;
end;
$$;

-- Volontairement NON accorde a `authenticated` : ce helper lit
-- `auth.users`. Il n'est appele que depuis des fonctions `security
-- definer` dont l'acces est deja controle.
revoke all on function public.rattacher_par_email(text) from public, anon, authenticated;

comment on function public.rattacher_par_email(text) is
  'Rattache la fiche eleve ou prof portant cette adresse au compte Supabase Auth de meme adresse, s''il en existe un ET qu''il n''appartient encore a personne. Renvoie l''user_id rattache, ou null. Rejouable sans effet de bord. Complete le trigger on_auth_user_created, qui ne se declenche qu''a la creation du compte : une fiche creee APRES la premiere connexion resterait sinon orpheline pour toujours.';


-- ---------------------------------------------------------------------
-- 2. Le bouton de l'administrateur — a actionner apres chaque import
-- ---------------------------------------------------------------------
create or replace function public.reparer_rattachements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_repares int := 0;
  r         record;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  for r in select email from public.eleves where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then
      v_repares := v_repares + 1;
    end if;
  end loop;

  for r in select email from public.profs where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then
      v_repares := v_repares + 1;
    end if;
  end loop;

  perform public.journaliser('reparer_rattachements', null,
    jsonb_build_object('rattaches', v_repares));

  return jsonb_build_object('rattaches', v_repares);
end;
$$;

grant execute on function public.reparer_rattachements() to authenticated;

comment on function public.reparer_rattachements() is
  'Rejoue le rattachement pour toutes les fiches sans user_id : celles dont le compte Google existait deja avant la creation de la fiche. Reserve a l''administrateur, sans effet de bord, a lancer apres chaque import de rentree. Renvoie le nombre de fiches rattachees.';


-- ---------------------------------------------------------------------
-- 3. Les points d'entree appellent le helper
--
-- Les deux fonctions sont reprises TELLES QUELLES de la migration 7 ;
-- seul l'appel a `rattacher_par_email` est ajoute. Rien d'autre de leur
-- comportement ne change.
-- ---------------------------------------------------------------------

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
    perform public.rattacher_par_email(v_email);   -- migration 22
    perform public.journaliser('reactivation_via_ajout', v_email, '{}');
    return jsonb_build_object('ok', true, 'reactive', true, 'eleve_id', v_id,
      'message', 'Cet eleve existait deja, desactive. Il a ete reactive.');
  end if;

  insert into public.eleves (email, nom, prenom, classe, plafond_tables)
  values (v_email, p_nom, p_prenom, p_classe, public.plafond_par_defaut(p_classe))
  returning id into v_id;

  -- MIGRATION 22 — si cette personne s'est deja connectee avant que sa
  -- fiche existe, son compte Auth est deja la et le trigger
  -- `on_auth_user_created` ne se declenchera plus jamais pour elle.
  -- On rattache maintenant, sinon jamais.
  perform public.rattacher_par_email(v_email);

  perform public.journaliser('ajout_eleve', v_email,
    jsonb_build_object('classe', p_classe));

  return jsonb_build_object('ok', true, 'reactive', false, 'eleve_id', v_id,
    'message', 'Eleve ajoute. Il peut se connecter immediatement.');
end;
$$;

create or replace function public.importer_eleves(p_eleves jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_crees      int := 0;
  v_maj        int := 0;
  v_rattaches  int := 0;
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
    -- MIGRATION 22 — rejoue pour chaque ligne, creee comme mise a jour :
    -- la rentree echelonnee garantit que des eleves auront ouvert
    -- l'application avant l'import de leur classe.
    if public.rattacher_par_email(v_email) is not null then
      v_rattaches := v_rattaches + 1;
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
    'crees', v_crees, 'mis_a_jour', v_maj, 'rattaches', v_rattaches,
    'ignores', jsonb_array_length(v_ignores),
    'absents_du_fichier', jsonb_array_length(v_absents)));

  return jsonb_build_object(
    'crees', v_crees,
    'mis_a_jour', v_maj,
    'rattaches', v_rattaches,
    'lignes_ignorees', v_ignores,
    'actifs_absents_du_fichier', v_absents
  );
end;
$$;

comment on function public.importer_eleves(jsonb) is
  'Import de rentree. Ne desactive personne : un eleve absent du fichier est seulement signale dans `actifs_absents_du_fichier`. Populations : `crees` + `mis_a_jour` comptent les lignes retenues du FICHIER ; `actifs_absents_du_fichier` compte les eleves ACTIFS de la BASE absents du fichier — deux ensembles differents, jamais a rapprocher en fraction. `rattaches` compte les fiches reliees a un compte Google preexistant (migration 22).';


-- ---------------------------------------------------------------------
-- 4. La passe de reparation immediate
-- Debloque les fiches actuellement orphelines, dont celle qui a revele
-- le defaut. Idempotente : la rejouer ne fait rien de plus.
-- ---------------------------------------------------------------------
do $$
declare
  r  record;
  n  int := 0;
begin
  for r in select email from public.eleves where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then n := n + 1; end if;
  end loop;
  for r in select email from public.profs where user_id is null loop
    if public.rattacher_par_email(r.email) is not null then n := n + 1; end if;
  end loop;
  raise notice 'Migration 22 : % fiche(s) rattachee(s) a un compte existant.', n;
end $$;
