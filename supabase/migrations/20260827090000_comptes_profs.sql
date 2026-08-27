-- =====================================================================
-- Calcul Mental Saintho
-- Migration 8 : comptes enseignants, et fin du cloisonnement par classe
-- =====================================================================
--
-- DEUX DECISIONS, PRISES LE 27 AOUT 2026
--
-- 1. UN ENSEIGNANT VOIT TOUTES LES CLASSES.
--
--    Le cloisonnement `profs.classes[]` disparaît en tant que
--    permission. Motif : les affectations changent chaque année, un
--    professeur remplace un collègue, échange un service. Le champ
--    serait périmé en permanence, et chaque « je ne vois pas ma
--    classe » remonterait à l'administrateur.
--
--    L'établissement compte quatre professeurs de mathématiques qui se
--    croisent tous les jours. A cette échelle, la traçabilité vaut
--    mieux que le cloisonnement : tout est journalisé, tout est
--    réversible, et personne ne peut supprimer un élève.
--
--    `profs.classes[]` SURVIT, mais comme simple RACCOURCI — « mes
--    classes habituelles », pour ouvrir directement la bonne. Vide par
--    défaut : on voit alors la liste complète. Rien à maintenir.
--
--    Note RGPD : un enseignant accède donc aux données de maîtrise de
--    tout le collège. C'est proportionné — données pédagogiques,
--    collègues du même établissement, intérêt éducatif légitime — mais
--    à mentionner au registre de traitement.
--
-- 2. DEUX ROLES, PAS DE MATRICE DE DROITS.
--
--    `prof`  : tout le pédagogique + la gestion des élèves
--    `admin` : en plus, l'import de rentrée et les comptes enseignants
--
--    Un enseignant peut être administrateur : c'est le même compte, le
--    rôle vaut `admin`, et il garde toutes les capacités d'un prof.
-- =====================================================================

comment on column public.profs.classes is
  'Classes habituelles — RACCOURCI d''affichage uniquement, ne donne aucun droit. Vide = voit la liste complète.';

-- ---------------------------------------------------------------------
-- Les deux verrous de permission s'ouvrent à tous les enseignants.
--
-- On garde volontairement les MEMES NOMS de fonction : toutes les
-- politiques RLS des migrations 2 et 7 les appellent, elles suivent
-- donc automatiquement sans être réécrites.
-- ---------------------------------------------------------------------
create or replace function public.prof_voit_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_prof();
$$;

comment on function public.prof_voit_classe(text) is
  'Depuis le 27/08/2026 : tout enseignant voit toutes les classes. Le parametre est conserve pour ne pas reecrire les politiques RLS.';

create or replace function public.peut_administrer_classe(p_classe text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.est_prof();
$$;

-- =====================================================================
-- COMPTES ENSEIGNANTS
-- Quatre professeurs : la saisie à la main suffit, pas besoin d'import.
-- =====================================================================

create or replace function public.creer_prof(
  p_email   text,
  p_nom     text,
  p_role    text default 'prof',
  p_classes text[] default '{}'
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
  v_actif boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;
  if p_role not in ('prof', 'admin') then
    raise exception 'Role inconnu : % (attendu prof ou admin)', p_role;
  end if;
  if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
    raise exception 'Adresse e-mail invalide : %', p_email;
  end if;

  select id, actif into v_id, v_actif from public.profs where lower(email) = v_email;

  if v_id is not null then
    if v_actif then
      return jsonb_build_object('ok', false, 'raison', 'existe_deja',
        'message', 'Ce compte enseignant existe deja.', 'prof_id', v_id);
    end if;
    update public.profs
       set actif = true, nom = p_nom, role = p_role, classes = coalesce(p_classes, '{}')
     where id = v_id;
    perform public.journaliser('reactivation_prof', v_email,
      jsonb_build_object('role', p_role));
    return jsonb_build_object('ok', true, 'reactive', true, 'prof_id', v_id,
      'message', 'Ce compte existait, desactive. Il a ete reactive.');
  end if;

  insert into public.profs (email, nom, role, classes)
  values (v_email, p_nom, p_role, coalesce(p_classes, '{}'))
  returning id into v_id;

  perform public.journaliser('creation_prof', v_email,
    jsonb_build_object('role', p_role, 'nom', p_nom));

  return jsonb_build_object('ok', true, 'reactive', false, 'prof_id', v_id,
    'message', 'Compte cree. Il peut se connecter immediatement avec son adresse.');
end;
$$;

-- ---------------------------------------------------------------------
-- Modifier un compte enseignant
--
-- ⚠️ GARDE-FOU : il doit toujours rester AU MOINS UN administrateur
-- actif. Sans ce verrou, une fausse manœuvre — se retrograder soi-meme
-- quand on est seul admin — enfermerait tout le monde dehors, et il
-- faudrait passer par la console Supabase pour s'en sortir.
-- ---------------------------------------------------------------------
create or replace function public.nb_admins_actifs()
returns integer
language sql stable security definer set search_path = public
as $$
  select count(*)::integer from public.profs where role = 'admin' and actif;
$$;

create or replace function public.modifier_prof(
  p_prof_id uuid,
  p_nom     text default null,
  p_role    text default null,
  p_classes text[] default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p public.profs%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into v_p from public.profs where id = p_prof_id;
  if not found then raise exception 'Compte enseignant introuvable'; end if;

  if p_role is not null and p_role not in ('prof', 'admin') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  if p_role = 'prof' and v_p.role = 'admin' and v_p.actif
     and public.nb_admins_actifs() <= 1 then
    raise exception 'Impossible : c''est le dernier administrateur actif. Nomme d''abord un autre administrateur.';
  end if;

  update public.profs
     set nom     = coalesce(p_nom, nom),
         role    = coalesce(p_role, role),
         classes = coalesce(p_classes, classes)
   where id = p_prof_id;

  perform public.journaliser('modification_prof', v_p.email,
    jsonb_build_object('avant', jsonb_build_object('nom', v_p.nom, 'role', v_p.role)));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.desactiver_prof(p_prof_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_p public.profs%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into v_p from public.profs where id = p_prof_id;
  if not found then raise exception 'Compte enseignant introuvable'; end if;

  if v_p.role = 'admin' and v_p.actif and public.nb_admins_actifs() <= 1 then
    raise exception 'Impossible : c''est le dernier administrateur actif. Nomme d''abord un autre administrateur.';
  end if;

  update public.profs set actif = false where id = p_prof_id;
  perform public.journaliser('desactivation_prof', v_p.email, '{}');

  return jsonb_build_object('ok', true,
    'message', 'Compte desactive. Il n''a plus acces a l''application.');
end;
$$;

-- ---------------------------------------------------------------------
-- Chaque enseignant règle SES propres raccourcis de classe.
-- Pas besoin d'être administrateur : ce ne sont que des favoris.
-- ---------------------------------------------------------------------
create or replace function public.definir_mes_classes(p_classes text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_id uuid := public.prof_courant();
begin
  if v_id is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  update public.profs set classes = coalesce(p_classes, '{}') where id = v_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- La liste des enseignants, pour l'écran d'administration
-- ---------------------------------------------------------------------
create or replace function public.liste_profs()
returns table (
  prof_id   uuid,
  email     text,
  nom       text,
  role      text,
  classes   text[],
  actif     boolean,
  connecte  boolean
)
language sql security definer set search_path = public
as $$
  select p.id, p.email, p.nom, p.role, p.classes, p.actif,
         p.user_id is not null
    from public.profs p
   where public.est_prof()
   order by p.actif desc, p.role, p.nom;
$$;

-- ---------------------------------------------------------------------
-- Toutes les classes existantes, avec leurs effectifs
-- Sert au sélecteur de classe : plus d'affectation figée, on choisit.
-- ---------------------------------------------------------------------
create or replace function public.liste_classes()
returns table (
  classe        text,
  niveau        text,
  eleves_actifs integer,
  est_favorite  boolean
)
language sql security definer set search_path = public
as $$
  select e.classe,
         public.niveau_scolaire(e.classe),
         count(*)::integer,
         e.classe = any(coalesce(
           (select classes from public.profs where user_id = auth.uid()), '{}'))
    from public.eleves e
   where e.actif and public.est_prof()
   group by e.classe
   order by e.classe;
$$;

grant execute on function
  public.creer_prof(text, text, text, text[]),
  public.modifier_prof(uuid, text, text, text[]),
  public.desactiver_prof(uuid),
  public.definir_mes_classes(text[]),
  public.nb_admins_actifs(),
  public.liste_profs(),
  public.liste_classes()
to authenticated;
