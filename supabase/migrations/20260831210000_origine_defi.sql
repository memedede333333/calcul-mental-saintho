-- =====================================================================
-- MIGRATION 18 — L'ORIGINE DU DEFI, ET UN DENOMINATEUR QUI COMPTE JUSTE
--
-- 1. « 2 / 1 ONT TERMINE ».
--    C'est ce qu'affiche l'ecran « Mes defis » sur la base reelle, et
--    c'est un defaut de la migration 17 : `participants` comptait TOUS
--    les joueurs, `attendus` comptait les eleves de la classe visee.
--    Deux populations differentes au numerateur et au denominateur.
--    Le defi 379S4 vise la 31 (un eleve actif) ; Lou (31) et Adeliya
--    (32) l'ont joue. D'ou 2 / 1.
--
--    On ne restreint PAS la participation a la classe visee : faire
--    jouer la 31 contre la 32 est une demande explicite, et c'est ce
--    qui rend les defis interessants. On compte donc les deux choses
--    separement : combien d'eleves DE LA CLASSE ont joue (sur son
--    effectif), et combien de joueurs au total.
--
-- 2. UN DEFI DE PROF ET UN DEFI D'ELEVE NE PESENT PAS PAREIL.
--    Memes points — un point mesure l'effort de celui qui repond, pas
--    le grade de celui qui a cree le defi. Mais pas le meme statut :
--    un defi de prof est du travail prescrit, le seul qu'on puisse
--    evoquer en classe ou cocher « fait / pas fait ». La base sait
--    deja les distinguer (`cree_par_prof` XOR `cree_par_eleve`) ;
--    il manquait l'etiquette a l'ecran.
--
--    `origine` ('prof' | 'eleve') et `auteur_nom`. Le nom d'un
--    professeur est complet — les eleves connaissent leur prof. Le nom
--    d'un eleve passe par `nom_public()`, comme partout ailleurs :
--    « Lou A. », jamais le nom de famille entier.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Qui a cree ce defi ? Une seule definition, utilisee par les trois
-- fonctions ci-dessous — pour qu'elles ne puissent jamais diverger.
-- ---------------------------------------------------------------------
create or replace function public.auteur_defi(p_defi_id uuid)
returns table (origine text, auteur_nom text)
language sql
stable
security definer
set search_path = public
as $$
  select case when d.cree_par_prof is not null then 'prof' else 'eleve' end,
         coalesce(
           (select p.nom from public.profs p where p.id = d.cree_par_prof),
           (select public.nom_public(e.prenom, e.nom)
              from public.eleves e where e.id = d.cree_par_eleve))
    from public.defis d
   where d.id = p_defi_id;
$$;

-- ---------------------------------------------------------------------
-- MES DEFIS — trois compteurs au lieu de deux, et l'origine
-- ---------------------------------------------------------------------
drop function if exists public.mes_defis(integer);

create function public.mes_defis(p_limite integer default 20)
returns table (
  defi_id             uuid,
  code                text,
  type                text,
  classe              text,
  tables              smallint[],
  cree_le             timestamptz,
  expire_le           timestamptz,
  encore_ouvert       boolean,
  origine             text,      -- 'prof' | 'eleve'
  auteur_nom          text,
  participants        integer,   -- tous les joueurs, toutes classes
  participants_classe integer,   -- ceux de la classe visee (null si aucune)
  attendus            integer    -- effectif de la classe visee (null sinon)
)
language sql
security definer
set search_path = public
as $$
  select d.id,
         d.code,
         d.type,
         d.classe,
         d.tables,
         d.cree_le,
         d.expire_le,
         (d.statut = 'ouvert' and d.expire_le > now()),
         a.origine,
         a.auteur_nom,
         (select count(*)::integer from public.defis_participants p
           where p.defi_id = d.id),
         -- Meme population que `attendus` : sans quoi on affiche « 2 / 1 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer
              from public.defis_participants p
              join public.eleves e on e.id = p.eleve_id
             where p.defi_id = d.id and e.classe = d.classe) end,
         -- Un denominateur n'a de sens que pour un defi DE PROF adresse a
         -- une classe. Trois amis sur 27 ne sont pas « 3 / 27 ».
         case when d.cree_par_prof is null or d.classe is null then null else
           (select count(*)::integer from public.eleves e
             where e.actif and e.classe = d.classe) end
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where (public.prof_courant()  is not null and d.cree_par_prof  = public.prof_courant())
      or (public.eleve_courant() is not null and d.cree_par_eleve = public.eleve_courant())
   order by d.cree_le desc
   limit p_limite;
$$;

-- ---------------------------------------------------------------------
-- AVANCEMENT — l'en-tete de l'ecran de classement d'un defi
-- Meme correction de population, plus l'origine et l'auteur.
-- ---------------------------------------------------------------------
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'origine',         a.origine,
    'auteur_nom',      a.auteur_nom,
    'classe',          d.classe,
    'termines',        (select count(*) from public.defis_participants p
                         where p.defi_id = d.id),
    'termines_classe', case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.defis_participants p
                            join public.eleves e on e.id = p.eleve_id
                           where p.defi_id = d.id and e.classe = d.classe) end,
    'attendus',        case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.eleves e
                           where e.actif and e.classe = d.classe) end
  )
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where d.id = p_defi_id;
$$;

-- ---------------------------------------------------------------------
-- REJOINDRE — l'eleve doit savoir DE QUI est le defi avant de jouer.
-- « Defi de M. Desjardins » et « Defi de Lou A. » ne s'abordent pas de
-- la meme facon, et c'est le seul moment ou on peut le lui dire.
-- ---------------------------------------------------------------------
create or replace function public.rejoindre_defi(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function
  public.auteur_defi(uuid),
  public.mes_defis(integer)
to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis crees par l''utilisateur courant, du plus recent au plus ancien, expires compris. `participants` compte tous les joueurs ; `participants_classe` et `attendus` comptent la meme population — les eleves de la classe visee — pour que le ratio affiche ait un sens.';
