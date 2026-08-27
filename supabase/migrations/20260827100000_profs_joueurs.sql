-- =====================================================================
-- Calcul Mental Saintho
-- Migration 9 : les enseignants jouent aussi
-- =====================================================================
--
-- Un professeur qui pratique lui-même l'outil le comprend mieux, sait
-- de quoi il parle en classe, et peut se mesurer à ses collègues.
--
-- CHOIX DE CONCEPTION : une table SEPAREE, `sessions_profs`.
--
-- On aurait pu ajouter une colonne `prof_id` à `sessions_jeu`. Ce
-- serait une erreur : toutes les fonctions de classement, la maîtrise,
-- les badges, les défis reposent sur `eleve_id` et sont testés. Y
-- introduire une seconde identité, c'est ouvrir la porte à ce qu'un
-- professeur apparaisse un jour dans un classement d'élèves à cause
-- d'un oubli de filtre.
--
-- Deux tables, aucune intersection possible. Le code existant n'est
-- pas touché d'une ligne.
--
-- Les parties des enseignants ne donnent ni badges ni grille de
-- maîtrise : c'est pour le plaisir et l'émulation entre collègues, pas
-- un dispositif de remédiation.
-- =====================================================================

create table public.sessions_profs (
  id            uuid primary key default gen_random_uuid(),
  prof_id       uuid not null references public.profs(id) on delete cascade,
  mode          text not null check (mode in
                  ('libre', 'sprint', 'flawless', 'countdown', 'climb')),
  tables        smallint[] not null default '{}',
  nb_questions  integer not null default 0,
  score         integer not null default 0,
  duree_s       numeric(8,2) not null default 0,
  serie_max     integer not null default 0,
  sans_faute_max integer not null default 0,
  plus_haute_table smallint,
  points        integer not null default 0,
  cree_le       timestamptz not null default now()
);

create index sessions_profs_idx on public.sessions_profs (prof_id, cree_le desc);

alter table public.sessions_profs enable row level security;
grant select, insert on public.sessions_profs to authenticated;

-- Les scores des enseignants ne sont visibles QUE des enseignants.
-- Aucun élève ne peut lire cette table, ni par requête directe ni par
-- classement : il n'existe aucune fonction qui l'expose aux élèves.
create policy sessions_profs_lecture on public.sessions_profs
  for select to authenticated using (public.est_prof());

create policy sessions_profs_insert on public.sessions_profs
  for insert to authenticated with check (prof_id = public.prof_courant());

-- ---------------------------------------------------------------------
-- Enregistrer une partie d'enseignant
-- Aucun plafond de tables : un adulte joue ce qu'il veut, jusqu'a 20.
-- ---------------------------------------------------------------------
create or replace function public.enregistrer_session_prof(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof   uuid := public.prof_courant();
  v_id     uuid;
  v_points integer;
begin
  if v_prof is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incoherent';
  end if;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);

  insert into public.sessions_profs (
    prof_id, mode, tables, nb_questions, score, duree_s,
    serie_max, sans_faute_max, plus_haute_table, points)
  values (
    v_prof, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, p_duree_s,
    p_serie_max, p_sans_faute_max, p_plus_haute_table, v_points)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'points', v_points);
end;
$$;

-- ---------------------------------------------------------------------
-- LE CLASSEMENT DE LA SALLE DES PROFS
-- Reserve aux enseignants — la fonction ne renvoie rien a un eleve.
--
-- Contrairement au classement des eleves, on affiche le nom COMPLET :
-- entre adultes qui se connaissent, « M. D. » n'aurait aucun sens.
-- ---------------------------------------------------------------------
create or replace function public.classement_profs(
  p_categorie text default 'points',   -- points | serie | chrono | sprint | montee
  p_periode   text default 'tout',
  p_limite    integer default 20
)
returns table (
  rang     bigint,
  nom      text,
  valeur   numeric,
  parties  integer,
  est_moi  boolean
)
language sql
security definer
set search_path = public
as $$
  select row_number() over (
           order by case when p_categorie = 'sprint' then v end asc nulls last,
                    case when p_categorie <> 'sprint' then v end desc nulls last) as rang,
         nom, round(v, 1), parties, moi
    from (
      select p.nom,
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
       group by p.id, p.nom
    ) x
   where v is not null
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- QUI SUIS-JE ?
--
-- Il manquait la brique la plus basique : au demarrage, l'application
-- n'avait aucun moyen de savoir si la personne connectee est un eleve
-- ou un enseignant, donc quel ecran d'accueil afficher.
--
-- `mon_profil()` ne repond que pour les eleves et renvoyait null a un
-- professeur. A appeler en premier, juste apres la connexion.
-- =====================================================================
create or replace function public.qui_suis_je()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when public.eleve_courant() is not null then
      jsonb_build_object(
        'type', 'eleve',
        'profil', (select to_jsonb(x) from (
            select id, prenom, nom, classe, avatar_emoji, plafond_tables,
                   tables_autorisees
              from public.eleves where id = public.eleve_courant()) x))
    when public.prof_courant() is not null then
      jsonb_build_object(
        'type', 'prof',
        'admin', public.est_admin(),
        'profil', (select to_jsonb(x) from (
            select id, nom, email, role, classes
              from public.profs where id = public.prof_courant()) x))
    else
      -- Compte cree mais absent des tables : c'est la barriere d'entree.
      -- L'ecran doit dire de contacter son professeur, pas planter.
      jsonb_build_object('type', 'inconnu',
        'message', 'Ce compte n''est pas reconnu. Demande a ton professeur.')
  end;
$$;

grant execute on function
  public.enregistrer_session_prof(text, smallint[], integer, integer, numeric, integer, integer, smallint),
  public.classement_profs(text, text, integer),
  public.qui_suis_je()
to authenticated;
