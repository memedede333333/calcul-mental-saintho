-- =====================================================================
-- MIGRATION 29 — la salle des profs, et trois compteurs qui manquaient
--
-- 1. UN AVATAR POUR LES ENSEIGNANTS — OU LEURS INITIALES
--    La maquette 32 donne un avatar a chaque collegue ; `profs` n'a pas
--    de colonne pour ca. Aymeri a tranche : on laisse le choix, emoji ou
--    initiales. La colonne est donc NULLABLE, et `null` n'est pas un
--    trou a combler — c'est le choix « affiche mes initiales ».
--    Les initiales sont calculees EN BASE : deux ecrans qui decoupent un
--    nom chacun a leur facon finissent par afficher deux sigles
--    differents pour la meme personne.
--
-- 2. LA LIGNE DE LA SALLE DES PROFS
--    `classement_profs()` ne renvoyait ni le role, ni l'avatar, ni les
--    points quand on trie sur autre chose, ni le meilleur sprint. La
--    maquette 32 affiche « Collegue · Role · Points · Sprint » : quatre
--    colonnes pour une fonction qui n'en donnait qu'une.
--    On garde les SIX colonnes du contrat commun des classements
--    (ETAT.md §3) en tete — le composant partage les lit et ignore le
--    reste — et on ajoute les quatre autres derriere. `valeur` demeure
--    la valeur de la categorie demandee : c'est elle qui TRIE, et le tri
--    appartient au serveur.
--    PAS DE COLONNE `matiere`. Quatorze adultes, un champ que personne
--    ne remplira, et une matiere perimee affichee comme un fait vaut
--    moins que rien. Le role, lui, dit qui peut modifier les comptes.
--
-- 3. « 14 COLLEGUES ONT UN COMPTE · 9 ONT JOUE CE MOIS »
--    Deux populations. `classement_profs` ne connait que la seconde : il
--    ne renvoie que ceux qui ont joue. Les rapprocher cote ecran, en
--    comptant `listeProfs()` d'un cote et les lignes du classement de
--    l'autre, c'est exactement ce qui a produit cinq bugs ici.
--    `entete_salle_des_profs()` renvoie les deux, nommees, en un appel.
--
-- 4. « 18 ONT REJOINT · 16 ONT TERMINE » DANS MES DEFIS
--    `mes_defis()` date d'avant la migration 25 : il compte les
--    participants, pas les presences. La maquette 28 veut les deux.
--    On ajoute `rejoints` sans toucher a `participants`, qui garde son
--    sens — ceux qui ont TERMINE.
--
-- 5. « SALLE DES PROFS · CE MOIS » DANS LE PROFIL ENSEIGNANT
--    `mon_profil_prof()` ne renvoyait que le total et la semaine, la
--    maquette 30 annonce le mois. On ajoute les chiffres du mois plutot
--    que de changer le libelle : un enseignant qui joue une fois par
--    quinzaine verrait toujours zero sur la semaine.
--
-- NUMEROTATION : 20260908210000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. L'AVATAR DES ENSEIGNANTS, ET LEURS INITIALES
-- ---------------------------------------------------------------------
alter table public.profs
  add column if not exists avatar_emoji text;

comment on column public.profs.avatar_emoji is
  'L''emoji choisi par l''enseignant, ou NULL. NULL n''est pas un trou a combler : c''est le choix « affiche mes initiales ». Aucun ecran ne doit inventer un emoji par defaut.';

-- « Aymeri Desjardins » -> « AD ». Un nom en un seul mot -> sa premiere
-- lettre. Un nom vide -> null, et l'ecran affiche alors le nom entier.
create or replace function public.initiales_de(p_nom text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(string_agg(upper(left(mot, 1)), '' order by n), '')
    from (
      select mot, n
        from unnest(regexp_split_to_array(coalesce(trim(p_nom), ''), '\s+'))
             with ordinality as t(mot, n)
       where mot <> ''
       order by n
       limit 2
    ) x;
$$;

grant execute on function public.initiales_de(text) to authenticated;

comment on function public.initiales_de(text) is
  'Les initiales d''un nom, deux lettres au plus. Calculees en base pour que deux ecrans ne decoupent pas le meme nom de deux facons differentes. Renvoie null sur un nom vide : l''ecran affiche alors le nom entier.';


-- ---------------------------------------------------------------------
-- 2. UN ENSEIGNANT CHOISIT SON AVATAR — LUI SEUL, ET RIEN D'AUTRE
--
-- On passe par une fonction plutot que par une politique RLS d'UPDATE :
-- une politique ouvrirait la LIGNE entiere, role compris, et un
-- enseignant pourrait se nommer administrateur.
--
-- `p_emoji` a null remet les initiales. C'est un choix, pas un
-- effacement.
-- ---------------------------------------------------------------------
create or replace function public.changer_avatar_prof(p_emoji text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof uuid := public.prof_courant();
begin
  if v_prof is null then
    raise exception 'Reserve aux enseignants.' using errcode = '42501';
  end if;

  -- Aucun texte libre nulle part dans cette application : l'ecran propose
  -- une liste fermee, et la base refuse ce qui n'a pas la taille d'un
  -- emoji.
  if p_emoji is not null and (length(p_emoji) > 8 or trim(p_emoji) = '') then
    raise exception 'Choisis un emoji dans la liste.' using errcode = 'P0001';
  end if;

  update public.profs set avatar_emoji = p_emoji where id = v_prof;

  return jsonb_build_object('ok', true, 'avatar_emoji', p_emoji);
end;
$$;

grant execute on function public.changer_avatar_prof(text) to authenticated;

comment on function public.changer_avatar_prof(text) is
  'Un enseignant choisit son emoji, ou passe null pour revenir a ses initiales. C''est le seul champ qu''il peut changer sur sa propre fiche : on passe par une fonction et non par une politique RLS d''UPDATE, qui ouvrirait la ligne entiere et lui permettrait de se nommer administrateur.';


-- ---------------------------------------------------------------------
-- 3. LA LIGNE DE LA SALLE DES PROFS
--
-- Le retour change de forme : il faut un drop, `create or replace` ne
-- sait pas modifier un type de retour.
-- ---------------------------------------------------------------------
drop function if exists public.classement_profs(text, text, integer);

create or replace function public.classement_profs(
  p_categorie text default 'points',   -- points | serie | chrono | sprint | montee
  p_periode   text default 'tout',
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,     -- nom COMPLET : ce sont des collegues
  classe      text,     -- toujours null, present pour l'uniformite
  avatar      text,     -- l'emoji choisi par le collegue, ou null
  valeur      numeric,  -- la valeur de p_categorie : c'est elle qui trie
  parties     integer,
  est_moi     boolean,
  -- Ajouts de la migration 29, APRES les six colonnes du contrat commun
  -- (ETAT.md §3) : le composant partage lit les six premieres et ignore
  -- le reste.
  initiales   text,     -- pour un collegue qui a choisi les initiales
  role        text,     -- 'prof' | 'admin'
  points      integer,  -- toujours renvoye, quelle que soit p_categorie
  meilleur_sprint numeric  -- en secondes, null s'il n'a jamais fait de sprint
)
language sql
security definer
set search_path = public
as $$
  select row_number() over (
           order by case when p_categorie = 'sprint' then v end asc nulls last,
                    case when p_categorie <> 'sprint' then v end desc nulls last) as rang,
         nom, null::text, avatar, round(v, 1), parties, moi,
         initiales, role, points, round(sprint, 1)
    from (
      select p.nom,
             p.avatar_emoji                       as avatar,
             p.role,
             public.initiales_de(p.nom)           as initiales,
             sum(s.points)::integer               as points,
             min(s.duree_s) filter (where s.mode = 'sprint') as sprint,
             case p_categorie
               when 'points' then sum(s.points)::numeric
               when 'serie'  then max(s.sans_faute_max)::numeric
               when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
               when 'montee' then max(s.plus_haute_table)::numeric
               when 'sprint' then min(s.duree_s) filter (where s.mode = 'sprint')
             end                                  as v,
             count(*)::integer                    as parties,
             p.id = public.prof_courant()         as moi
        from public.profs p
        join public.sessions_profs s on s.prof_id = p.id
       where p.actif
         and public.est_prof()          -- verrou : rien pour un eleve
         and s.cree_le >= public.debut_periode(p_periode)
       group by p.id, p.nom, p.avatar_emoji, p.role
    ) x
   where v is not null
   order by rang
   limit p_limite;
$$;

grant execute on function public.classement_profs(text, text, integer) to authenticated;

comment on function public.classement_profs(text, text, integer) is
  'Le classement de la salle des profs. Les SIX premieres colonnes sont celles du contrat commun des classements (ETAT.md §3) : le composant partage les lit et ignore les suivantes. `valeur` est la valeur de p_categorie, et c''est elle qui TRIE. `classe` est toujours null — un enseignant n''appartient pas a une classe dans ce classement. `avatar` vaut null quand le collegue a choisi ses initiales : l''ecran affiche alors `initiales`, jamais un emoji par defaut. `points` et `meilleur_sprint` sont toujours renvoyes, quelle que soit la categorie, pour que la maquette 32 affiche ses deux colonnes en un seul appel. Reserve aux enseignants : un eleve obtient zero ligne.';


-- ---------------------------------------------------------------------
-- 4. LES DEUX POPULATIONS DE LA SALLE DES PROFS
--
-- `ont_joue` est un sous-ensemble strict de `inscrits`. Ne jamais
-- afficher l'un sans l'autre, jamais de pourcentage entre les deux.
-- ---------------------------------------------------------------------
create or replace function public.entete_salle_des_profs(
  p_periode text default 'mois'
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'inscrits', count(*),
    'ont_joue', count(*) filter (where exists (
                  select 1 from public.sessions_profs s
                   where s.prof_id = p.id
                     and s.cree_le >= public.debut_periode(p_periode))))
    from public.profs p
   where p.actif
     and public.est_prof();
$$;

grant execute on function public.entete_salle_des_profs(text) to authenticated;

comment on function public.entete_salle_des_profs(text) is
  'L''en-tete de la salle des profs. DEUX POPULATIONS NOMMEES : `inscrits` = enseignants actifs ayant un compte ; `ont_joue` = ceux d''entre eux qui ont joue au moins une fois sur la periode, sous-ensemble strict des inscrits. Ne jamais afficher l''un sans l''autre. Reserve aux enseignants : un eleve obtient zero partout.';


-- ---------------------------------------------------------------------
-- 5. MES DEFIS — « ont rejoint » a cote de « ont termine »
--
-- Meme raison qu'au §3 : le retour change de forme, donc un drop.
-- ---------------------------------------------------------------------
drop function if exists public.mes_defis(integer);

create or replace function public.mes_defis(p_limite integer default 20)
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
  rejoints            integer,   -- ont SAISI LE CODE (migration 25)
  participants        integer,   -- ont TERMINE, toutes classes
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
         -- Ont saisi le code. Vaut 0 pour les defis anterieurs a la
         -- migration 25 : la table de presences n'existait pas.
         (select count(*)::integer from public.defis_presences pr
           where pr.defi_id = d.id),
         -- Ont TERMINE. Sens inchange depuis l'origine.
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

grant execute on function public.mes_defis(integer) to authenticated;

comment on function public.mes_defis(integer) is
  'Les defis crees par l''utilisateur courant, du plus recent au plus ancien, expires compris. QUATRE POPULATIONS, QUATRE NOMS : `rejoints` = ont saisi le code (vaut 0 pour les defis anterieurs a la migration 25) ; `participants` = ont TERMINE, toutes classes ; `participants_classe` et `attendus` comptent la meme population, les eleves de la classe visee, pour que le ratio affiche ait un sens. Un denominateur n''a de sens que pour un defi DE PROF adresse a une classe : trois amis sur 27 ne sont pas « 3 / 27 ».';


-- ---------------------------------------------------------------------
-- 6. LE PROFIL ENSEIGNANT — l'avatar, les initiales, et le mois
-- ---------------------------------------------------------------------
create or replace function public.mon_profil_prof()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case when public.prof_courant() is null then
    jsonb_build_object('ok', false, 'raison', 'pas_un_prof',
      'message', 'Ce profil est reserve aux enseignants.')
  else
  jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, nom, email, role, classes, avatar_emoji,
               public.initiales_de(nom) as initiales,
               role = 'admin' as est_admin
          from public.profs where id = public.prof_courant()) x),
    'records', (select jsonb_build_object(
        'nb_sessions',      count(*),
        'points_total',     coalesce(sum(points), 0),
        'points_semaine',   coalesce(sum(points)
                              filter (where cree_le >= public.debut_periode('semaine')), 0),
        'meilleure_serie',  coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',  coalesce(max(score) filter (where mode = 'countdown'), 0),
        'meilleur_sprint',  coalesce(min(duree_s) filter (where mode = 'sprint'), 0),
        'plus_haute_table', coalesce(max(plus_haute_table), 0),
        -- Migration 29 : la maquette 30 annonce « Salle des profs · ce
        -- mois ». On ajoute les chiffres du mois plutot que de changer
        -- le libelle : un enseignant qui joue une fois par quinzaine
        -- verrait toujours zero sur la semaine.
        'points_mois',  coalesce(sum(points)
                          filter (where cree_le >= public.debut_periode('mois')), 0),
        'parties_mois', count(*) filter (where cree_le >= public.debut_periode('mois')),
        'sprint_mois',  coalesce(min(duree_s) filter (
                          where mode = 'sprint'
                            and cree_le >= public.debut_periode('mois')), 0))
        from public.sessions_profs where prof_id = public.prof_courant()),
    -- Sa place dans la salle des profs, s'il a joue.
    'rang_salle_des_profs', (
        select rang from public.classement_profs('points', 'tout', 100)
         where est_moi limit 1))
  end;
$$;

