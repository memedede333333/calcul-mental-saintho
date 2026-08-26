-- =====================================================================
-- Calcul Mental Saintho — API
-- Migration 3/3 : fonctions RPC (défis, sessions, classements)
-- =====================================================================
--
-- Le front n'écrit JAMAIS directement dans les tables. Il appelle ces
-- fonctions. Deux raisons :
--   1. Le serveur valide (défi ouvert ? déjà joué ? score cohérent ?)
--   2. Les classements ne renvoient que des champs publics — jamais
--      d'email ni d'identifiant.
--
-- Nom d'affichage : "Alice D." (prénom + initiale). C'est suffisant
-- pour qu'un élève se reconnaisse, et ça évite d'afficher l'état civil
-- complet de 300 mineurs sur un écran de classement.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nom public d'un élève
-- ---------------------------------------------------------------------
create or replace function public.nom_public(p_prenom text, p_nom text)
returns text
language sql immutable
as $$
  select p_prenom || ' ' || upper(left(p_nom, 1)) || '.';
$$;

-- ---------------------------------------------------------------------
-- Bornes d'une période
-- 'semaine' | 'mois' | 'annee' | 'tout'
-- L'année scolaire démarre au 1er septembre, pas au 1er janvier.
-- ---------------------------------------------------------------------
create or replace function public.debut_periode(p_periode text)
returns timestamptz
language sql stable
as $$
  select case p_periode
    when 'semaine' then date_trunc('week', now())
    when 'mois'    then date_trunc('month', now())
    when 'annee'   then
      case when extract(month from now()) >= 9
           then make_timestamptz(extract(year from now())::int,     9, 1, 0, 0, 0)
           else make_timestamptz(extract(year from now())::int - 1, 9, 1, 0, 0, 0)
      end
    else '-infinity'::timestamptz
  end;
$$;

-- =====================================================================
-- ENREGISTRER UNE PARTIE
-- Appelée à la fin de CHAQUE partie, défi ou pas.
-- Met à jour la maîtrise, attribue les badges, renvoie les nouveautés.
-- =====================================================================
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
  p_maitrise        jsonb    default '{}',   -- {"3_7": 2, "8_9": 3}
  p_defi_id         uuid     default null
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
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.'
      using errcode = '42501';
  end if;

  -- Garde-fou de cohérence : un score ne peut pas dépasser le nombre
  -- de questions posées. Empêche un score fantaisiste envoyé à la main.
  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max, p_plus_haute_table)
  returning id into v_session_id;

  -- ---- Maîtrise -----------------------------------------------------
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

  -- ---- Badges de série ----------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  -- ---- Badges de montée ---------------------------------------------
  foreach v_seuil in array array[10, 12, 15] loop
    if coalesce(p_plus_haute_table, 0) >= v_seuil then
      v_badge := 'climb_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  -- ---- Badges de vitesse --------------------------------------------
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

  -- ---- Badges de régularité (jours consécutifs) ----------------------
  declare
    v_jours integer;
  begin
    select count(distinct date_trunc('day', cree_le))
      into v_jours
      from public.sessions_jeu
     where eleve_id = v_eleve
       and cree_le > now() - interval '7 days';

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
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- =====================================================================
-- CRÉER UN DÉFI
-- Les questions sont générées ICI, une fois, et figées. Tous les
-- participants auront exactement la même série.
-- =====================================================================
create or replace function public.creer_defi(
  p_type    text,                       -- 'sprint' | 'countdown'
  p_tables  smallint[],
  p_nb_questions integer default 20,
  p_duree_s integer default null,       -- requis pour 'countdown'
  p_classe  text    default null,
  p_expire_dans interval default '7 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve     uuid := public.eleve_courant();
  v_prof      uuid := public.prof_courant();
  v_questions jsonb := '[]';
  v_a smallint; v_b smallint;
  v_code text;
  v_id   uuid;
  v_n    integer;
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

  -- Pour le contre-la-montre on prépare une réserve large : personne
  -- ne sait combien de questions il aura le temps de faire.
  v_n := case when p_type = 'countdown' then 120 else p_nb_questions end;

  for i in 1..v_n loop
    v_a := p_tables[1 + floor(random() * array_length(p_tables, 1))::int];
    v_b := 1 + floor(random() * 10)::int;
    v_questions := v_questions || jsonb_build_object('a', v_a, 'b', v_b);
  end loop;

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    -- Sans classe explicite, on prend celle du créateur : c'est ce qui
    -- permet au compteur « 18 / 28 ont terminé » de connaître l'effectif.
    coalesce(p_classe, (select classe from public.eleves where id = v_eleve)),
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    now() + p_expire_dans)
  returning id into v_id;

  return jsonb_build_object('defi_id', v_id, 'code', v_code, 'type', p_type);
end;
$$;

-- =====================================================================
-- REJOINDRE UN DÉFI PAR SON CODE
-- Renvoie trois erreurs DISTINCTES — c'est important pour l'élève :
-- "code inconnu", "défi terminé", "tu as déjà joué".
-- =====================================================================
create or replace function public.rejoindre_defi(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
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

  return jsonb_build_object(
    'ok', true,
    'defi_id',   v_defi.id,
    'type',      v_defi.type,
    'tables',    to_jsonb(v_defi.tables),
    'duree_s',   v_defi.duree_s,
    'questions', v_defi.questions
  );
end;
$$;

-- =====================================================================
-- TERMINER UN DÉFI
-- Enregistre la participation ET la session de jeu en une seule fois.
-- La clé primaire (defi_id, eleve_id) empêche toute seconde tentative.
-- =====================================================================
create or replace function public.terminer_defi(
  p_defi_id  uuid,
  p_score    integer,
  p_temps_s  numeric,
  p_erreurs  integer default 0,
  p_detail   jsonb   default '{}',
  p_maitrise jsonb   default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu.' using errcode = '42501';
  end if;

  select * into v_defi from public.defis where id = p_defi_id;
  if not found then
    raise exception 'Défi introuvable.';
  end if;

  if v_defi.statut = 'ferme' or v_defi.expire_le < now() then
    raise exception 'Ce défi est déjà terminé.';
  end if;

  begin
    insert into public.defis_participants (
      defi_id, eleve_id, score, temps_s, erreurs, detail)
    values (p_defi_id, v_eleve, p_score, p_temps_s, p_erreurs, p_detail);
  exception when unique_violation then
    raise exception 'Tu as déjà participé à ce défi.';
  end;

  perform public.enregistrer_session(
    p_mode           => v_defi.type,
    p_tables         => v_defi.tables,
    p_nb_questions   => p_score + p_erreurs,
    p_score          => p_score,
    p_duree_s        => p_temps_s,
    p_sans_faute_max => 0,
    p_maitrise       => p_maitrise,
    p_defi_id        => p_defi_id
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- CLASSEMENT D'UN DÉFI
-- C'est LUI qui produit l'effet « quasi-direct » : l'élève qui vient de
-- finir le rappelle toutes les 5 s (ou s'abonne en Realtime) et regarde
-- les autres arriver.
--
-- Tri : score décroissant, puis temps croissant.
-- Pour le sprint, le temps est pénalisé de +3 s par erreur.
-- =====================================================================
create or replace function public.classement_defi(p_defi_id uuid)
returns table (
  rang         bigint,
  nom_affiche  text,
  classe       text,
  avatar       text,
  score        integer,
  temps_s      numeric,
  est_moi      boolean
)
language sql
security definer
set search_path = public
as $$
  with participations as (
    select p.eleve_id, p.score, p.erreurs,
           e.prenom, e.nom, e.classe, e.avatar_emoji,
           d.type,
           -- Sprint : le classement se fait au temps, pénalisé de +3 s
           -- par erreur (règle affichée aux élèves avant la partie).
           case when d.type = 'sprint'
                then p.temps_s + 3 * p.erreurs
                else p.temps_s
           end as temps_classement
      from public.defis_participants p
      join public.eleves e on e.id = p.eleve_id
      join public.defis  d on d.id = p.defi_id
     where p.defi_id = p_defi_id
  )
  select row_number() over (
           order by
             -- Sprint : le plus rapide gagne.
             -- Contre-la-montre : le meilleur score gagne, le temps
             -- ne départage que les ex æquo.
             case when type = 'sprint' then temps_classement else -score end asc,
             temps_classement asc
         )                                          as rang,
         public.nom_public(prenom, nom)             as nom_affiche,
         classe,
         avatar_emoji                               as avatar,
         score,
         round(temps_classement, 1)                 as temps_s,
         eleve_id = public.eleve_courant()          as est_moi
    from participations
   order by rang;
$$;

-- Combien d'élèves ont terminé ? (pour le compteur « 18/28 »)
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'termines', (select count(*) from public.defis_participants where defi_id = p_defi_id),
    -- `attendus` vaut NULL si le défi n'est rattaché à aucune classe :
    -- le front doit alors afficher « 12 ont terminé » sans dénominateur.
    'attendus', (select case when d.classe is null then null else
                   (select count(*) from public.eleves e
                     where e.actif and e.classe = d.classe) end
                   from public.defis d where d.id = p_defi_id)
  );
$$;

-- =====================================================================
-- CLASSEMENT « RECORDS » (performance brute)
-- categorie : 'serie' | 'chrono' | 'sprint' | 'montee'
-- periode   : 'semaine' | 'mois' | 'annee' | 'tout'
-- portee    : 'college' | 'classe'
-- =====================================================================
create or replace function public.classement_records(
  p_categorie text default 'serie',
  p_periode   text default 'tout',
  p_portee    text default 'college',
  p_limite    integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  valeur      numeric,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe from public.eleves where id = public.eleve_courant()
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.score) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       and (p_portee = 'college'
            or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  )
  select row_number() over (
           order by case when p_categorie = 'sprint' then valeur end asc nulls last,
                    case when p_categorie <> 'sprint' then valeur end desc nulls last
         ) as rang,
         public.nom_public(prenom, nom),
         classe,
         avatar_emoji,
         round(valeur, 1),
         id = public.eleve_courant()
    from base
   where valeur is not null
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- CLASSEMENT « PROGRESSION »
-- C'est le classement mis en avant par défaut. Il récompense le
-- travail fourni, pas le niveau de départ — un élève fragile qui
-- s'entraîne régulièrement peut être premier.
--
-- FORMULE (à ajuster librement après observation en classe) :
--     points = somme des scores de la période
--            + 10 × nombre de jours d'activité distincts
--            +  5 × nombre de faits passés en vert sur la période
-- =====================================================================
create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'college',
  p_limite  integer default 20
)
returns table (
  rang        bigint,
  nom_affiche text,
  classe      text,
  avatar      text,
  points      integer,
  est_moi     boolean
)
language sql
security definer
set search_path = public
as $$
  with moi as (
    select id, classe from public.eleves where id = public.eleve_courant()
  ),
  bornes as (select public.debut_periode(p_periode) as depuis),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.score), 0)                                as pts_score,
           count(distinct date_trunc('day', s.cree_le))             as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from bornes)
     where e.actif
       and (p_portee = 'college' or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb
      from public.maitrise
     where niveau = 3
       and derniere_vue >= (select depuis from bornes)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0)) desc) as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts_score + 10 * a.jours + 5 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

-- =====================================================================
-- MON PROFIL — tout ce qu'affiche l'écran Profil, en un seul appel
-- =====================================================================
create or replace function public.mon_profil()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profil', (select to_jsonb(x) from (
        select id, prenom, nom, classe, avatar_emoji, tables_autorisees, email
          from public.eleves where id = public.eleve_courant()) x),
    'records', (select jsonb_build_object(
        'meilleure_serie',   coalesce(max(sans_faute_max), 0),
        'meilleur_chrono',   coalesce(max(score) filter (where mode = 'countdown'), 0),
        'plus_haute_table',  coalesce(max(plus_haute_table), 0),
        'nb_sessions',       count(*))
        from public.sessions_jeu where eleve_id = public.eleve_courant()),
    'maitrise', (select coalesce(jsonb_object_agg(fait, niveau), '{}')
        from public.maitrise where eleve_id = public.eleve_courant()),
    'badges', (select coalesce(jsonb_agg(badge_id), '[]')
        from public.badges where eleve_id = public.eleve_courant())
  );
$$;

-- =====================================================================
-- DROITS D'EXÉCUTION
-- =====================================================================
grant execute on function
  public.enregistrer_session(text, smallint[], integer, integer, jsonb, numeric,
                             integer, integer, smallint, jsonb, uuid),
  public.creer_defi(text, smallint[], integer, integer, text, interval),
  public.rejoindre_defi(text),
  public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb),
  public.classement_defi(uuid),
  public.avancement_defi(uuid),
  public.classement_records(text, text, text, integer),
  public.classement_progression(text, text, integer),
  public.mon_profil()
to authenticated;

-- Realtime : le classement d'un défi se met à jour tout seul chez les
-- élèves qui ont fini. C'est tout ce qu'il faut pour l'effet « direct ».
alter publication supabase_realtime add table public.defis_participants;
