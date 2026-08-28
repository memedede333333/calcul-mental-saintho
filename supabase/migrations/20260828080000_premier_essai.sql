-- =====================================================================
-- Calcul Mental Saintho
-- Migration 12 : la reponse trouvee du premier coup vaut plus
-- =====================================================================
--
-- POURQUOI (decide avec Aymeri le 28 aout 2026)
--
-- La saisie passe a un modele a CASES : autant de cases que de chiffres
-- dans la reponse. Des que la derniere case est remplie, le systeme
-- juge. Si c'est faux, les cases se vident et l'eleve peut reessayer
-- tant que le compte a rebours de la question tourne.
--
-- Il fallait alors decider ce que vaut une reponse rattrapee.
--
--   * Ne rien accorder etait un piege : chercher coutait des secondes
--     pour zero point, alors qu'abandonner ne coutait rien. Le jeu
--     aurait appris a renoncer.
--
--   * Accorder le point entier effacait toute difference entre savoir
--     ses tables et les retrouver en tatonnant — or c'est exactement
--     la difference que le classement doit montrer.
--
-- REGLE RETENUE, la meme partout :
--
--   trouve du premier coup  ->  1 point
--   rattrape               ->  1/2 point
--   jamais trouve          ->  0
--
-- Chercher rapporte donc toujours plus qu'abandonner, et l'automatisme
-- reste mieux paye que le tatonnement. C'est la ponderation par table,
-- appliquee un cran plus fin.
--
-- COMPATIBILITE : `p_score_premier_essai` vaut null par defaut, et est
-- alors traite comme egal a `p_score`. Les parties mises en attente
-- hors ligne par l'ancien client remontent donc sans etre penalisees.
-- =====================================================================

alter table public.sessions_jeu
  add column if not exists score_premier_essai integer not null default 0;

comment on column public.sessions_jeu.score_premier_essai is
  'Reponses justes des la premiere saisie complete. Les autres reussites sont des rattrapages et valent un demi-point.';

alter table public.sessions_profs
  add column if not exists score_premier_essai integer not null default 0;

-- ---------------------------------------------------------------------
-- Une seule definition du calcul, partagee eleves / enseignants.
-- ---------------------------------------------------------------------
create or replace function public.points_session(
  p_score              integer,
  p_score_premier      integer,
  p_tables             smallint[]
)
returns integer
language sql immutable
as $$
  select round(
    (coalesce(p_score_premier, p_score)
     + 0.5 * (p_score - coalesce(p_score_premier, p_score)))
    * public.poids_moyen(p_tables) * 10
  )::integer;
$$;

comment on function public.points_session(integer, integer, smallint[]) is
  'Premier coup = 1 point, rattrapage = 1/2, le tout multiplie par le poids moyen des tables. p_score_premier null => tout compte comme premier coup (ancien client).';

drop function if exists public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid);

create or replace function public.enregistrer_session(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_erreurs         jsonb    default '[]',
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_maitrise        jsonb    default '{}',
  p_defi_id         uuid     default null,
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve      uuid := public.eleve_courant();
  v_session_id uuid;
  v_fait       text;
  v_niveau     smallint;
  v_nouveaux   text[] := '{}';
  v_badge      text;
  v_seuil      integer;
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
  v_montee     smallint;
  v_premier    integer := coalesce(p_score_premier_essai, p_score);
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un rattrapage ne peut pas exister sans reussite : le nombre de
  -- reponses trouvees du premier coup est borne par le total.
  if v_premier > p_score or v_premier < 0 then
    raise exception 'Score du premier essai incohérent';
  end if;

  select plafond_tables into v_plafond from public.eleves where id = v_eleve;
  if p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tu n''as pas encore debloque la table %. Passe par la Montee des tables.',
      (select max(x) from unnest(p_tables) x)
      using errcode = 'P0001';
  end if;

  -- Seule la Montee des tables temoigne d'une table « atteinte ».
  v_montee := case when p_mode = 'climb' then p_plus_haute_table else null end;

  v_points := public.points_session(p_score, v_premier, p_tables);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score, score_premier_essai,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, v_premier,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    v_montee, v_points, v_palier)
  returning id into v_session_id;

  if coalesce(v_montee, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(v_montee, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(v_montee, 0) + 1);
  end if;

  -- ---- Maitrise ------------------------------------------------------
  -- Le front envoie desormais 3 = juste du premier coup, 2 = rattrape,
  -- 1 = jamais trouve. La grille distingue donc l'automatisme du
  -- tatonnement, ce qu'elle ne faisait pas avant.
  for v_fait, v_niveau in
    select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
  loop
    insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
    values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
    on conflict (eleve_id, fait) do update
      set niveau       = excluded.niveau,
          nb_vues      = public.maitrise.nb_vues + 1,
          nb_reussites = public.maitrise.nb_reussites
                         + case when excluded.niveau >= 2 then 1 else 0 end,
          derniere_vue = now();
  end loop;

  -- ---- Badges --------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(v_montee, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  if p_nb_questions >= 10 and p_duree_s > 0 then
    if p_duree_s / p_nb_questions < 2 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_2s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_2s'::text; end if;
    elsif p_duree_s / p_nb_questions < 3 then
      insert into public.badges (eleve_id, badge_id) values (v_eleve, 'speed_3s')
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || 'speed_3s'::text; end if;
    end if;
  end if;

  declare v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le)) into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve and cree_le > now() - interval '7 days';
    foreach v_seuil in array array[3, 7] loop
      if v_jours >= v_seuil then
        v_badge := 'days_' || v_seuil;
        insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
        on conflict do nothing;
        if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
      end if;
    end loop;
  end;

  return jsonb_build_object(
    'session_id',      v_session_id,
    'points',          v_points,
    'palier',          v_palier,
    'score',           p_score,
    'premier_essai',   v_premier,
    'rattrapees',      p_score - v_premier,
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Meme regle pour les enseignants.
-- ---------------------------------------------------------------------
drop function if exists public.enregistrer_session_prof(
  text, smallint[], integer, integer, numeric, integer, integer, smallint);

create or replace function public.enregistrer_session_prof(
  p_mode            text,
  p_tables          smallint[],
  p_nb_questions    integer,
  p_score           integer,
  p_duree_s         numeric  default 0,
  p_serie_max       integer  default 0,
  p_sans_faute_max  integer  default 0,
  p_plus_haute_table smallint default null,
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prof    uuid := public.prof_courant();
  v_id      uuid;
  v_points  integer;
  v_premier integer := coalesce(p_score_premier_essai, p_score);
begin
  if v_prof is null then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incoherent';
  end if;
  if v_premier > p_score or v_premier < 0 then
    raise exception 'Score du premier essai incoherent';
  end if;

  v_points := public.points_session(p_score, v_premier, p_tables);

  insert into public.sessions_profs (
    prof_id, mode, tables, nb_questions, score, score_premier_essai, duree_s,
    serie_max, sans_faute_max, plus_haute_table, points)
  values (
    v_prof, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score, v_premier, p_duree_s,
    p_serie_max, p_sans_faute_max, p_plus_haute_table, v_points)
  returning id into v_id;

  return jsonb_build_object('session_id', v_id, 'points', v_points,
    'score', p_score, 'premier_essai', v_premier, 'rattrapees', p_score - v_premier);
end;
$$;

grant execute on function
  public.points_session(integer, integer, smallint[]),
  public.enregistrer_session(text, smallint[], integer, integer, jsonb, numeric,
                             integer, integer, smallint, jsonb, uuid, integer),
  public.enregistrer_session_prof(text, smallint[], integer, integer, numeric,
                                  integer, integer, smallint, integer)
to authenticated;
