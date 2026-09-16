-- =====================================================================
-- Calcul Mental Saintho
-- Migration 48 : le coupe-circuit des défis entre élèves
-- =====================================================================
-- Les élèves peuvent se défier entre eux — décision du 31 août, §3 — mais
-- un professeur doit pouvoir couper net si une classe dérape.
--
-- CE QU'ON NE FAIT PAS
-- Pas de table miroir, pas de refonte des six fonctions de défi, rien de
-- touché aux défis existants ni à leurs scores. Une table de réglage à
-- une ligne, deux fonctions, et DEUX `if` insérés dans du code existant.
-- C'est le format du couvre-feu, pas celui du comparateur.
--
-- ON COUPE L'ENTRÉE, JAMAIS LA SORTIE
-- `terminer_defi` n'est pas touchée, et c'est le point le plus important
-- de cette migration. Un élève qui a rejoint AVANT la coupure doit
-- pouvoir finir sa partie et l'enregistrer. Refuser l'écriture lui
-- effacerait un défi réellement joué — la leçon du couvre-feu, où la
-- file d'attente hors-ligne aurait jeté des parties légitimes. Le cas 247
-- le vérifie pour que personne ne « complète » ce contrôle plus tard.
--
-- LE NIVEAU EST DÉDUIT, DONC IL EST DÉDUIT UNE SEULE FOIS
-- Il n'existe pas de colonne « niveau » : `eleves.classe` contient « 6A »,
-- « 5B ». `niveau_de_classe()` fait la déduction, à un seul endroit, et
-- toutes les autres fonctions l'appellent. Une classe qui ne commence pas
-- par un chiffre — « ULIS » — devient son propre niveau plutôt que de
-- tomber dans un trou.
--
-- LA LISTE EST UNE RESTRICTION, PAS UNE AUTORISATION
-- Trouvé en exécutant, pas en relisant. Ma première version amorçait
-- `niveaux_autorises` avec les niveaux présents en base au moment de la
-- migration. Sur la production ça marche — il y a 313 élèves. Sur une
-- base reconstruite depuis zéro, les migrations passent AVANT les
-- données : la liste naissait vide et coupait les défis de tout le
-- collège, en silence. Or c'est exactement ce que fait `RESTAURATION.md`
-- — structure depuis les migrations, données depuis la sauvegarde. Une
-- restauration aurait donc rendu la base muette sur ce point.
--
-- Donc : **liste vide = aucune restriction**, tout le monde peut jouer.
-- Une liste non vide ne laisse passer que les niveaux qu'elle nomme. Un
-- réglage par défaut n'éteint jamais une fonctionnalité ; seule une
-- décision explicite le fait.
--
-- Et quand la liste est renseignée, elle est fermée : une classe dont le
-- niveau n'y figure pas est bloquée. L'administrateur a vu les cases —
-- `niveaux_existants` les lui a toutes montrées, « ULIS » comprise — et
-- il a choisi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LE NIVEAU D'UNE CLASSE — une seule définition
-- ---------------------------------------------------------------------
create or replace function public.niveau_de_classe(p_classe text)
returns text
language sql
immutable
as $$
  select case
    when p_classe is null or trim(p_classe) = '' then null
    when trim(p_classe) ~ '^[0-9]+'
      then (regexp_match(trim(p_classe), '^([0-9]+)'))[1]
    else trim(p_classe)
  end;
$$;

comment on function public.niveau_de_classe(text) is
  'Le niveau d''une classe : « 6A » -> « 6 », « 3EME1 » -> « 3 ». Une classe qui ne commence pas par un chiffre — « ULIS » — devient son propre niveau, plutot que de tomber hors de toutes les cases. Une seule definition, appelee partout ailleurs.';


-- ---------------------------------------------------------------------
-- 2. LE RÉGLAGE — une seule ligne, comme le couvre-feu
-- ---------------------------------------------------------------------
create table if not exists public.reglages_defis_eleves (
  unique_ligne      boolean primary key default true check (unique_ligne),
  actif             boolean     not null default true,
  niveaux_autorises text[]      not null default '{}',
  modifie_le        timestamptz not null default now(),
  modifie_par       text
);

-- La ligne unique, avec une liste VIDE — c'est-à-dire aucune restriction.
-- Voir l'en-tête : un réglage par défaut n'éteint jamais rien, et cette
-- migration doit se comporter pareil sur la production et sur une base
-- restaurée où les données arrivent après.
insert into public.reglages_defis_eleves (unique_ligne) values (true)
on conflict (unique_ligne) do nothing;

comment on table public.reglages_defis_eleves is
  'Le coupe-circuit des defis entre eleves, en un seul enregistrement. `actif` est l''interrupteur general, `niveaux_autorises` affine par niveau. Lu par `reglages_defis()`, modifie par `modifier_reglages_defis()`. Aucun ecran ne lit cette table directement.';

alter table public.reglages_defis_eleves enable row level security;
-- Aucune politique : la table n'est atteignable que par les fonctions
-- `security definer` ci-dessous. Le front n'ecrit jamais dans les tables.


-- ---------------------------------------------------------------------
-- 3. LA RÈGLE D'AUTORISATION — une seule définition, deux appelants
-- ---------------------------------------------------------------------
create or replace function public.defis_eleves_autorises(p_eleve_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select r.actif
     and (cardinality(r.niveaux_autorises) = 0
          or public.niveau_de_classe(e.classe) = any(r.niveaux_autorises))
    from public.reglages_defis_eleves r
    cross join public.eleves e
   where e.id = p_eleve_id;
$$;

comment on function public.defis_eleves_autorises(uuid) is
  'Cet eleve a-t-il le droit de creer ou de rejoindre un defi d''eleve ? Interrupteur general ET niveau autorise. Une liste VIDE ne restreint rien : tout le monde passe. Une liste renseignee ne laisse passer que les niveaux qu''elle nomme — une classe absente de la liste est donc bloquee. Interne, appelee par `creer_defi` et `rejoindre_defi` — une seule regle, deux points de controle.';

revoke all on function public.defis_eleves_autorises(uuid) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. CE QUE L'APPLICATION LIT
-- ---------------------------------------------------------------------
-- `je_peux_creer` est calcule ICI et pas dans l'ecran : React n'a pas a
-- comparer des chaines pour savoir si un bouton existe. C'est la regle
-- du projet — un ecran ne fabrique aucune population, pas meme celle-la.
--
-- `niveaux_existants` vient des classes REELLES de la base, pas d'une
-- liste de quatre cases ecrite en dur. Le jour ou une classe s'appelle
-- autrement, elle a sa case sans qu'on touche au code.
create or replace function public.reglages_defis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r        public.reglages_defis_eleves%rowtype;
  v_eleve  uuid := public.eleve_courant();
  v_res    jsonb;
begin
  select * into r from public.reglages_defis_eleves;

  select jsonb_build_object(
    'actif',             r.actif,
    'niveaux_autorises', to_jsonb(r.niveaux_autorises),
    'niveaux_existants', coalesce((
        select jsonb_agg(n order by n)
          from (select distinct public.niveau_de_classe(classe) as n
                  from public.eleves
                 where actif and public.niveau_de_classe(classe) is not null) d), '[]'::jsonb),
    'modifie_le',        r.modifie_le,
    -- Pour un eleve : la reponse toute faite. Pour un prof : null, il
    -- n'est pas concerne et l'ecran ne doit pas lire false comme un refus.
    'mon_niveau',        case when v_eleve is null then null
                              else (select public.niveau_de_classe(classe)
                                      from public.eleves where id = v_eleve) end,
    'je_peux_creer',     case when v_eleve is null then null
                              else public.defis_eleves_autorises(v_eleve) end
  ) into v_res;

  return v_res;
end;
$$;

comment on function public.reglages_defis() is
  'L''etat du coupe-circuit des defis entre eleves. `je_peux_creer` est la reponse deja calculee pour l''eleve connecte — l''ecran affiche ou masque le bouton sans rien deduire ; il vaut null pour un professeur, qui n''est pas concerne. `niveaux_existants` liste les niveaux REELS de la base, pour que l''ecran d''administration dessine une case par niveau qui existe vraiment. Ouvert a tout compte connecte.';

grant execute on function public.reglages_defis() to authenticated;


create or replace function public.modifier_reglages_defis(
  p_actif   boolean  default null,
  p_niveaux text[]   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a public.reglages_defis_eleves%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into a from public.reglages_defis_eleves;

  update public.reglages_defis_eleves
     set actif             = coalesce(p_actif, actif),
         niveaux_autorises = coalesce(p_niveaux, niveaux_autorises),
         modifie_le        = now(),
         modifie_par       = (select email from public.profs where user_id = auth.uid());

  perform public.journaliser('modification_defis_eleves', 'defis entre eleves',
    jsonb_build_object(
      'avant', jsonb_build_object('actif', a.actif,
                                  'niveaux', to_jsonb(a.niveaux_autorises)),
      'apres', (select jsonb_build_object('actif', actif,
                                          'niveaux', to_jsonb(niveaux_autorises))
                  from public.reglages_defis_eleves)));

  return public.reglages_defis();
end;
$$;

comment on function public.modifier_reglages_defis(boolean, text[]) is
  'Coupe ou retablit les defis entre eleves, en tout ou par niveau. Reserve a l''administrateur, comme le couvre-feu, et trace au journal d''audit avec l''avant et l''apres. Un parametre laisse a null conserve sa valeur.';

grant execute on function public.modifier_reglages_defis(boolean, text[]) to authenticated;


-- ---------------------------------------------------------------------
-- 5. LES DEUX CONTRÔLES, INSÉRÉS DANS LE TEXTE EXISTANT
-- ---------------------------------------------------------------------
-- Les deux fonctions ci-dessous sont celles qui tournent en base, avec
-- la verification inseree dedans. Jamais un corps reconstitue de memoire.
-- Signatures inchangees : `create or replace` suffit, aucun `drop`.

CREATE OR REPLACE FUNCTION public.creer_defi(p_type text, p_tables smallint[], p_nb_questions integer DEFAULT 20, p_duree_s integer DEFAULT NULL::integer, p_classe text DEFAULT NULL::text, p_expire_dans interval DEFAULT '7 days'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eleve     uuid := public.eleve_courant();
  v_prof      uuid := public.prof_courant();
  v_questions jsonb := '[]';
  v_a smallint; v_b smallint;
  v_code text; v_id uuid; v_n integer;
  v_ouverts integer;
  v_classe  text;
  v_max     smallint;
  v_effectif integer;
  v_hors    integer;
begin
  if v_eleve is null and v_prof is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  if p_type not in ('sprint', 'countdown') then
    raise exception 'Seuls les modes Sprint et Contre-la-montre peuvent être joués en défi.';
  end if;

  if array_length(p_tables, 1) is null then
    raise exception 'Choisis au moins une table.';
  end if;

  -- Un élève ne crée pas de défi au-dessus de son propre plafond,
  -- et pas plus de 5 défis ouverts à la fois (anti-spam).
  if v_prof is null then
    -- MIGRATION 48 : le coupe-circuit, avant tout autre refus. Un eleve
    -- suspendu doit lire la suspension, pas un message de plafond qui
    -- l'enverrait chercher au mauvais endroit.
    if not public.defis_eleves_autorises(v_eleve) then
      raise exception 'Les défis entre élèves sont temporairement suspendus par les enseignants.';
    end if;

    if (select max(x) from unnest(p_tables) x)
       > (select plafond_tables from public.eleves where id = v_eleve) then
      raise exception 'Tables au-delà de ton niveau débloqué';
    end if;

    select count(*) into v_ouverts from public.defis
     where cree_par_eleve = v_eleve and statut = 'ouvert' and expire_le > now();
    if v_ouverts >= 5 then
      raise exception 'Tu as déjà 5 défis en cours. Attends qu''ils se terminent.';
    end if;
  end if;

  v_n := case when p_type = 'countdown' then 120 else p_nb_questions end;

  for i in 1..v_n loop
    v_a := p_tables[1 + floor(random() * array_length(p_tables, 1))::int];
    v_b := 1 + floor(random() * 10)::int;
    v_questions := v_questions || jsonb_build_object('a', v_a, 'b', v_b);
  end loop;

  -- La classe visee, resolue UNE fois : c'est elle qui sert a la fois de
  -- denominateur au compteur « 18 / 27 ont termine » et de population au
  -- compteur d'eleves hors plafond ci-dessous. Deux compteurs, une seule
  -- population, nommee ici.
  v_classe := coalesce(p_classe,
                       (select classe from public.eleves where id = v_eleve));

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    v_classe,
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    -- Un défi créé par un élève vit 24 h ; un défi de prof, une semaine.
    now() + case when v_prof is null then interval '24 hours' else p_expire_dans end)
  returning id into v_id;

  -- Combien d'eleves de la classe visee n'ont pas ces tables debloquees.
  -- Le defi PART quand meme (migration 21 : le defi fait autorisation) ;
  -- ce chiffre sert a le dire au professeur, pas a lui opposer un veto.
  -- On renvoie les DEUX populations : « 12 » seul ne veut rien dire.
  v_max := (select max(x) from unnest(p_tables) x);
  select count(*), count(*) filter (where e.plafond_tables < v_max)
    into v_effectif, v_hors
    from public.eleves e
   where e.classe = v_classe and e.actif;

  return jsonb_build_object(
    'defi_id', v_id, 'code', v_code, 'type', p_type,
    'palier', public.palier_tables(p_tables),
    'classe', v_classe,
    'table_max', v_max,
    'eleves_classe', coalesce(v_effectif, 0),
    'eleves_hors_plafond', coalesce(v_hors, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rejoindre_defi(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
  v_a     record;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis
   where code = upper(trim(p_code));

  if not found then
    return jsonb_build_object('ok', false, 'raison', 'inconnu',
      'message', 'Ce code n''existe pas. Vérifie les lettres.');
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    return jsonb_build_object('ok', false, 'raison', 'ferme',
      'message', 'Ce défi est terminé.');
  end if;

  if exists (select 1 from public.defis_participants
              where defi_id = v_defi.id and eleve_id = v_eleve) then
    return jsonb_build_object('ok', false, 'raison', 'deja_joue',
      'message', 'Tu as déjà participé à ce défi.',
      'defi_id', v_defi.id);
  end if;

  -- MIGRATION 48 : un defi CREE PAR UN ELEVE est gele quand le
  -- coupe-circuit est ouvert. Le defi n'est ni ferme ni supprime, et les
  -- scores deja enregistres restent intacts : il devient seulement
  -- injoignable. Un defi de PROFESSEUR n'est jamais concerne.
  -- Le niveau qui compte est celui de CELUI QUI REJOINT, pas celui du
  -- createur : un 6e suspendu n'entre pas dans le defi d'un 5e autorise.
  -- On renvoie au lieu de lever : c'est la convention de cette fonction,
  -- l'ecran affiche `message`.
  if v_defi.cree_par_eleve is not null
     and not public.defis_eleves_autorises(v_eleve) then
    return jsonb_build_object('ok', false, 'raison', 'suspendu',
      'message', 'Les défis entre élèves sont temporairement suspendus par les enseignants.');
  end if;

  -- L'arrivee. Nouveau dans la migration 25.
  insert into public.defis_presences (defi_id, eleve_id)
  values (v_defi.id, v_eleve)
  on conflict (defi_id, eleve_id) do nothing;

  select * into v_a from public.auteur_defi(v_defi.id);

  return jsonb_build_object(
    'ok', true,
    'defi_id',    v_defi.id,
    'type',       v_defi.type,
    'tables',     to_jsonb(v_defi.tables),
    'duree_s',    v_defi.duree_s,
    'questions',  v_defi.questions,
    'origine',    v_a.origine,
    'auteur_nom', v_a.auteur_nom,
    'classe',     v_defi.classe
  );
end;
$function$;

-- Signatures relues en base avant d'ecrire ces deux lignes : un `grant`
-- sur une signature inventee ne leve aucune erreur, il cree juste un
-- droit sur une fonction qui n'existe pas — et l'application recevrait
-- « permission denied » depuis la migration 38.
grant execute on function public.creer_defi(text, smallint[], integer, integer, text, interval) to authenticated;
grant execute on function public.rejoindre_defi(text) to authenticated;
