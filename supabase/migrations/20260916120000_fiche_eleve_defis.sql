-- =====================================================================
-- Calcul Mental Saintho
-- Migration 49 : l'historique des défis dans la fiche d'un élève
-- =====================================================================
-- UNE fonction en lecture, rien d'autre. Aucune table touchée, aucune
-- fonction existante modifiée.
--
-- « QUI A ACCEPTÉ OU PAS » N'EXISTE PAS, ET NE PEUT PAS EXISTER
-- Il n'y a pas d'invitation dans matHo : un élève obtient un code et le
-- donne de vive voix. Personne n'est invité, donc personne ne refuse. Ce
-- que la base sait vraiment, ce sont trois états :
--   · entré            — il a tapé le code (`defis_presences`)
--   · terminé          — il a un score (`defis_participants`)
--   · entré sans finir — présent d'un côté, absent de l'autre
-- Un élève qui n'apparaît nulle part n'a peut-être jamais reçu le code.
-- L'écran ne doit donc jamais écrire « a refusé ».
--
-- ON NE SOUSTRAIT PAS — ET ICI ON N'EN A MÊME PLUS BESOIN
-- La migration 29 interdit de soustraire les terminés des rejoints : sur
-- un défi antérieur à la migration 25, la table des présences est vide
-- alors que les participations existent, et la différence devient
-- négative. La base a été remise à zéro le 11 septembre, mais le cas
-- revient dès qu'on restaure une sauvegarde d'avant.
-- La parade ici est structurelle : la liste des participants est
-- l'UNION des présences ET des participations. `nb_entres` ne peut donc
-- jamais être inférieur à `nb_termines`, et `nb_sans_finir` est compté
-- directement, personne par personne — pas obtenu par différence.
--
-- DES NOMS COMPLETS, PARCE QUE LE LECTEUR EST UN ENSEIGNANT
-- `auteur_defi()` renvoie « Alice D. » — le nom public, fait pour les
-- classements que voient 350 élèves. Cette fiche-ci est un écran
-- d'enseignant, et toutes les autres fonctions de cet écran renvoient
-- prénom et nom complets. Mettre « Alice D. » ici serait une fausse
-- protection et une vraie gêne : deux Alice dans une classe, et le
-- professeur ne sait plus de qui on parle.
--
-- LE DÉNOMINATEUR N'APPARTIENT QU'AUX DÉFIS DE PROFESSEUR
-- Décision du §3 : « 18 sur 27 » a un sens pour une classe entière ;
-- trois amis sur 27 ne sont pas « 3 / 27 ». `attendus` vaut donc
-- l'effectif de la classe pour un défi de professeur, et **null** pour un
-- défi entre élèves — l'écran écrit alors « 3 ont joué », sans barre de
-- fraction.
-- =====================================================================

create or replace function public.fiche_eleve_defis(
  p_eleve_id uuid,
  p_jours    int default 30
)
returns table (
  defi_id      uuid,
  code         text,
  cree_le      timestamptz,
  mode         text,
  tables       smallint[],
  nb_questions integer,
  duree_s      integer,
  origine      text,
  auteur_nom   text,
  classe_visee text,
  attendus     integer,
  role         text,
  mon_etat     text,
  mon_score    integer,
  mon_temps_s  numeric,
  nb_entres    integer,
  nb_termines  integer,
  nb_sans_finir integer,
  participants jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_depuis timestamptz;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  p_jours  := least(greatest(coalesce(p_jours, 30), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  return query
    select d.id,
           d.code,
           d.cree_le,
           d.type,
           d.tables,
           -- MIGRATION 33 : le nombre de questions ne veut rien dire hors
           -- Sprint — les 120 questions d'un Contre-la-montre sont une
           -- reserve technique, pas un objectif. Et la duree ne veut rien
           -- dire hors Contre-la-montre. Chacune est null chez l'autre.
           case when d.type = 'sprint'
                then jsonb_array_length(d.questions) end,
           case when d.type = 'countdown' then d.duree_s end,
           case when d.cree_par_prof is not null then 'prof' else 'eleve' end,
           -- Nom COMPLET : le lecteur est un enseignant.
           case when d.cree_par_prof is not null
                then (select pr.nom from public.profs pr where pr.id = d.cree_par_prof)
                else (select trim(ae.prenom || ' ' || ae.nom)
                        from public.eleves ae where ae.id = d.cree_par_eleve) end,
           d.classe,
           -- L'effectif attendu n'existe QUE pour un defi de professeur.
           case when d.cree_par_prof is not null and d.classe is not null
                then (select count(*)::integer from public.eleves ce
                       where ce.classe = d.classe and ce.actif) end,
           case when d.cree_par_eleve = p_eleve_id then 'createur' else 'invite' end,
           -- TROIS etats, pas deux. Vu en lisant la vraie sortie : un eleve
           -- qui cree un defi et n y joue jamais etait etiquete « entre
           -- sans finir » — alors qu il n est jamais entre. Creer n est
           -- pas jouer, et `creer_defi` n inscrit pas son auteur aux
           -- presences. Un mot faux sur un ecran de suivi, c est un
           -- professeur qui conclut de travers.
           case when exists (select 1 from public.defis_participants mp
                              where mp.defi_id = d.id and mp.eleve_id = p_eleve_id)
                then 'termine'
                when exists (select 1 from public.defis_presences mr
                              where mr.defi_id = d.id and mr.eleve_id = p_eleve_id)
                then 'entre_sans_finir'
                else 'pas_joue' end,
           (select mp.score   from public.defis_participants mp
             where mp.defi_id = d.id and mp.eleve_id = p_eleve_id),
           (select mp.temps_s from public.defis_participants mp
             where mp.defi_id = d.id and mp.eleve_id = p_eleve_id),
           m.nb_entres,
           m.nb_termines,
           m.nb_sans_finir,
           m.participants
      from public.defis d
      -- LE MONDE DU DEFI : l'union des presences ET des participations.
      -- C'est cette union qui rend toute soustraction inutile — et donc
      -- impossible a rendre negative, meme sur un defi anterieur a la
      -- migration 25 dont les presences sont vides.
      cross join lateral (
        select count(*)::integer as nb_entres,
               count(*) filter (where u.a_fini)::integer as nb_termines,
               count(*) filter (where not u.a_fini)::integer as nb_sans_finir,
               coalesce(jsonb_agg(jsonb_build_object(
                 'eleve_id', u.eleve_id,
                 'prenom',   u.prenom,
                 'nom',      u.nom,
                 'classe',   u.classe,
                 'etat',     case when u.a_fini then 'termine' else 'entre_sans_finir' end,
                 'score',    u.score,
                 'temps_s',  u.temps_s)
                 order by u.a_fini desc, u.score desc nulls last, u.nom, u.prenom), '[]'::jsonb)
                 as participants
          from (
            select w.eleve_id,
                   el.prenom, el.nom, el.classe,
                   pa.eleve_id is not null as a_fini,
                   pa.score, pa.temps_s
              from (
                select pr.eleve_id from public.defis_presences pr where pr.defi_id = d.id
                union
                select pp.eleve_id from public.defis_participants pp where pp.defi_id = d.id
              ) w
              join public.eleves el on el.id = w.eleve_id
              left join public.defis_participants pa
                     on pa.defi_id = d.id and pa.eleve_id = w.eleve_id
          ) u
      ) m
     where d.cree_le >= v_depuis
       and (d.cree_par_eleve = p_eleve_id
         or exists (select 1 from public.defis_presences xp
                     where xp.defi_id = d.id and xp.eleve_id = p_eleve_id)
         or exists (select 1 from public.defis_participants xa
                     where xa.defi_id = d.id and xa.eleve_id = p_eleve_id))
     order by d.cree_le desc;
end;
$$;

comment on function public.fiche_eleve_defis(uuid, int) is
  'L''historique des defis d''un eleve sur une periode glissante : ceux qu''il a crees ET ceux qu''il a rejoints, le plus recent d''abord. `origine` dit ''prof'' ou ''eleve'' et `auteur_nom` porte le nom COMPLET — le lecteur est un enseignant, pas un camarade. `attendus` n''existe que pour un defi de professeur (§3 : le denominateur n''appartient qu''a eux) et vaut null pour un defi entre eleves, ou l''ecran ecrit « 3 ont joue » sans fraction. `mon_etat` a TROIS valeurs : ''termine'', ''entre_sans_finir'', et ''pas_joue'' pour un eleve qui a cree le defi sans jamais y entrer — creer n''est pas jouer. `participants` est l''UNION des presences et des participations : chacun y porte son etat, ''termine'' ou ''entre_sans_finir'', et `nb_sans_finir` est compte personne par personne — JAMAIS obtenu en soustrayant, ce que la migration 29 interdit. Aucun etat ne signifie « a refuse » : il n''y a pas d''invitation dans matHo, seulement un code qu''on se passe. Reserve aux enseignants.';

grant execute on function public.fiche_eleve_defis(uuid, int) to authenticated;
