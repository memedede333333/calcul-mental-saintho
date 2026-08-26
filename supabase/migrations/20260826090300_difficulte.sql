-- =====================================================================
-- Calcul Mental Saintho — Difficulté et paliers
-- Migration 4/4 : tables jusqu'à 20, pondération, équité des classements
-- =====================================================================
--
-- LE PROBLÈME
-- L'app couvre désormais tout le collège, de la 6e à la 3e, avec des
-- tables allant jusqu'à 20. Si le classement compte simplement les
-- bonnes réponses, l'élève qui choisit les tables de 2 et 5 en aligne
-- deux fois plus que celui qui travaille 13×17. Le classement
-- récompense alors le choix de la facilité — exactement l'inverse de
-- ce qu'on veut.
--
-- LA RÉPONSE, EN DEUX TEMPS
--
--   1. PONDÉRATION — chaque fait vaut un nombre de points fonction de
--      sa difficulté réelle. 2×5 rapporte peu, 17×13 rapporte beaucoup.
--      Corrige le choix de facilité À L'INTÉRIEUR d'un même niveau.
--
--   2. PALIERS — on ne compare pas une 6e travaillant jusqu'à 10 avec
--      un 3e travaillant jusqu'à 20. Trois classements séparés.
--      Corrige l'écart ENTRE niveaux.
--
-- Les deux sont nécessaires : la pondération seule condamnerait les 6e
-- au bas du tableau, les paliers seuls laisseraient tricher sur le
-- choix des tables à l'intérieur d'un palier.
--
-- Dans un DÉFI, aucune correction n'est nécessaire : tout le monde a
-- exactement les mêmes questions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DIFFICULTÉ D'UN OPÉRANDE
--
-- Les valeurs ci-dessous ne sortent pas d'un chapeau : elles reflètent
-- ce qui rend un fait multiplicatif coûteux à récupérer en mémoire.
-- Une table qui repose sur une RÈGLE (×1, ×10, ×11 jusqu'à 9) est
-- quasi gratuite. Une table qui repose sur une ASTUCE (×2 doubler,
-- ×5 compter, ×4 doubler deux fois, ×9 complément à 10, ×20 doubler
-- puis ×10) est peu coûteuse. Les tables sans motif — 6, 7, 8 dans les
-- classiques, 13/14/17/19 au-delà — coûtent une vraie mémorisation.
-- 17 est la plus chère : nombre premier, aucun raccourci.
--
-- Un prof peut ajuster une ligne sans toucher au code.
-- ---------------------------------------------------------------------
create table public.difficulte_operande (
  n       smallint primary key check (n between 1 and 20),
  poids   numeric(3,2) not null check (poids > 0),
  raison  text not null
);

insert into public.difficulte_operande (n, poids, raison) values
  ( 1, 0.15, 'Règle : le nombre lui-même'),
  (10, 0.25, 'Règle : ajouter un zéro'),
  ( 2, 0.45, 'Astuce : doubler'),
  (20, 0.50, 'Astuce : doubler puis ajouter un zéro'),
  ( 5, 0.55, 'Astuce : compter de 5 en 5, moitié de la table de 10'),
  (11, 0.65, 'Règle : chiffre répété jusqu''à 9'),
  ( 3, 0.85, 'Table courte, apprise tôt'),
  ( 4, 0.95, 'Astuce : doubler deux fois'),
  ( 9, 1.00, 'Astuce : complément à 10, somme des chiffres'),
  ( 6, 1.25, 'Peu de motifs'),
  ( 8, 1.30, 'Peu de motifs'),
  (12, 1.35, 'Au-delà des tables classiques, encore courante'),
  ( 7, 1.45, 'La plus difficile des tables classiques'),
  (15, 1.50, 'Astuce : ×10 plus la moitié'),
  (14, 1.85, 'Aucun motif'),
  (13, 1.90, 'Aucun motif'),
  (16, 1.95, 'Aucun motif'),
  (18, 2.00, 'Aucun motif'),
  (19, 2.10, 'Astuce possible : ×20 moins le nombre'),
  (17, 2.20, 'Nombre premier, aucun raccourci');

grant select on public.difficulte_operande to authenticated;
-- Lecture ouverte : ce ne sont pas des données personnelles, et le
-- front s'en sert pour afficher la valeur en points d'une table.
alter table public.difficulte_operande enable row level security;
create policy difficulte_lecture on public.difficulte_operande
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- Poids d'un fait, poids moyen d'un ensemble de tables
-- ---------------------------------------------------------------------
create or replace function public.poids_fait(p_a smallint, p_b smallint)
returns numeric
language sql stable
as $$
  select coalesce(
    (select da.poids * db.poids
       from public.difficulte_operande da, public.difficulte_operande db
      where da.n = p_a and db.n = p_b),
    1.0);
$$;

-- Poids moyen d'une sélection de tables, en supposant le second
-- opérande tiré uniformément entre 1 et 10.
create or replace function public.poids_moyen(p_tables smallint[])
returns numeric
language sql stable
as $$
  select coalesce(
    (select avg(da.poids * db.poids)
       from unnest(p_tables) t
       join public.difficulte_operande da on da.n = t
      cross join public.difficulte_operande db
      where db.n between 1 and 10),
    1.0);
$$;

-- ---------------------------------------------------------------------
-- PALIERS
--   découverte : jusqu'à la table 10   — 6e / 5e
--   confirmé   : jusqu'à la table 12   — 5e / 4e
--   expert     : jusqu'à la table 20   — 4e / 3e et volontaires
-- Le palier d'une partie est déduit de la plus haute table jouée :
-- personne ne le choisit, donc personne ne peut se placer dans un
-- palier facile en jouant dur (ou l'inverse).
-- ---------------------------------------------------------------------
create or replace function public.palier_tables(p_tables smallint[])
returns text
language sql immutable
as $$
  select case
    when p_tables is null or array_length(p_tables, 1) is null then 'decouverte'
    when (select max(x) from unnest(p_tables) x) <= 10 then 'decouverte'
    when (select max(x) from unnest(p_tables) x) <= 12 then 'confirme'
    else 'expert'
  end;
$$;

-- ---------------------------------------------------------------------
-- Colonnes dérivées sur les sessions
-- ---------------------------------------------------------------------
alter table public.sessions_jeu
  add column points  integer not null default 0,
  add column palier  text    not null default 'decouverte';

comment on column public.sessions_jeu.points is
  'Score pondéré par la difficulté des tables jouées (×10 pour rester entier). C''est cette valeur qui alimente les classements, pas `score`.';

create index sessions_palier_idx on public.sessions_jeu (palier, cree_le desc);

-- ---------------------------------------------------------------------
-- Plafond de tables par élève
-- Le prof le règle par classe ; la Montée des tables le relève
-- automatiquement quand l'élève franchit un palier. Un élève ne peut
-- donc pas tomber sur du 17×18 sans l'avoir mérité.
-- ---------------------------------------------------------------------
alter table public.eleves
  add column plafond_tables smallint not null default 10
    check (plafond_tables between 5 and 20);

comment on column public.eleves.plafond_tables is
  'Table la plus haute que l''élève peut sélectionner. Défaut 10 (6e/5e), à monter à 12 puis 20. Relevé automatiquement par le mode Montée.';

-- Valeurs de départ raisonnables selon le niveau de classe
update public.eleves set plafond_tables =
  case when classe ~ '^6' then 10
       when classe ~ '^5' then 12
       else 15 end;

-- =====================================================================
-- MISE À JOUR DE enregistrer_session
-- Calcule les points pondérés, le palier, et relève le plafond quand
-- l'élève progresse en Montée des tables.
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
  p_maitrise        jsonb    default '{}',
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
  v_points     integer;
  v_palier     text;
  v_plafond    smallint;
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  if p_score > greatest(p_nb_questions, 0) then
    raise exception 'Score incohérent';
  end if;

  -- Un élève ne peut pas envoyer une partie sur des tables au-dessus de
  -- son plafond : ce serait le moyen simple de gonfler ses points.
  select plafond_tables into v_plafond from public.eleves where id = v_eleve;
  if p_tables is not null
     and (select max(x) from unnest(p_tables) x) > v_plafond then
    raise exception 'Tables au-delà de ton niveau débloqué';
  end if;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    p_plus_haute_table, v_points, v_palier)
  returning id into v_session_id;

  -- ---- Déblocage par la Montée des tables ----------------------------
  -- Franchir la table N en Montée débloque la table N+1 en entraînement.
  if p_mode = 'climb' and coalesce(p_plus_haute_table, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(p_plus_haute_table, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(p_plus_haute_table, 0) + 1);
  end if;

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

  -- ---- Badges -------------------------------------------------------
  foreach v_seuil in array array[10, 20, 30, 50, 100] loop
    if p_sans_faute_max >= v_seuil then
      v_badge := 'streak_' || v_seuil;
      insert into public.badges (eleve_id, badge_id) values (v_eleve, v_badge)
      on conflict do nothing;
      if found then v_nouveaux := v_nouveaux || v_badge::text; end if;
    end if;
  end loop;

  foreach v_seuil in array array[10, 12, 15, 20] loop
    if coalesce(p_plus_haute_table, 0) >= v_seuil then
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
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

-- =====================================================================
-- CLASSEMENTS — filtrés par palier, calculés sur les points pondérés
-- =====================================================================
drop function if exists public.classement_progression(text, text, integer);

create or replace function public.classement_progression(
  p_periode text default 'semaine',
  p_portee  text default 'classe',      -- 'classe' par défaut : voir §brief
  p_palier  text default null,          -- NULL = le palier de l'élève
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
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier,
      public.debut_periode(p_periode) as depuis
  ),
  activite as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           coalesce(sum(s.points), 0)                    as pts,
           count(distinct date_trunc('day', s.cree_le))  as jours
      from public.eleves e
      left join public.sessions_jeu s
             on s.eleve_id = e.id
            and s.cree_le >= (select depuis from cible)
            and s.palier   = (select palier from cible)
     where e.actif
       and (p_portee = 'college' or e.classe = (select classe from moi))
     group by e.id, e.prenom, e.nom, e.classe, e.avatar_emoji
  ),
  verts as (
    select eleve_id, count(*) as nb from public.maitrise
     where niveau = 3 and derniere_vue >= (select depuis from cible)
     group by eleve_id
  )
  select row_number() over (order by
           (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) desc)  as rang,
         public.nom_public(a.prenom, a.nom),
         a.classe,
         a.avatar_emoji,
         (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0))::integer as points,
         a.id = public.eleve_courant()
    from activite a
    left join verts v on v.eleve_id = a.id
   where (a.pts + 100 * a.jours + 50 * coalesce(v.nb, 0)) > 0
   order by rang
   limit p_limite;
$$;

drop function if exists public.classement_records(text, text, text, integer);

create or replace function public.classement_records(
  p_categorie text default 'serie',   -- serie | chrono | sprint | montee | points
  p_periode   text default 'tout',
  p_portee    text default 'classe',
  p_palier    text default null,
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
    select id, classe, plafond_tables from public.eleves where id = public.eleve_courant()
  ),
  cible as (
    select coalesce(p_palier,
      case when (select plafond_tables from moi) <= 10 then 'decouverte'
           when (select plafond_tables from moi) <= 12 then 'confirme'
           else 'expert' end) as palier
  ),
  base as (
    select e.id, e.prenom, e.nom, e.classe, e.avatar_emoji,
           case p_categorie
             when 'serie'  then max(s.sans_faute_max)::numeric
             when 'chrono' then max(s.points) filter (where s.mode = 'countdown')::numeric
             when 'montee' then max(s.plus_haute_table)::numeric
             when 'points' then sum(s.points)::numeric
             when 'sprint' then min(s.duree_s + 3 * jsonb_array_length(s.erreurs))
                                 filter (where s.mode = 'sprint')
           end as valeur
      from public.eleves e
      join public.sessions_jeu s on s.eleve_id = e.id
     where e.actif
       and s.cree_le >= public.debut_periode(p_periode)
       -- « montee » ignore le palier : c'est justement le classement
       -- qui montre jusqu'où chacun est allé, tous niveaux confondus.
       and (p_categorie = 'montee' or s.palier = (select palier from cible))
       and (p_portee = 'college' or e.classe = (select classe from moi))
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
-- LES TABLES QUE JE RATE
-- Alimente le bouton « Mes tables faibles » du sélecteur : plutôt que
-- de demander à un élève de 6e de savoir ce qu'il doit réviser, on le
-- lui propose. Les faits rouges d'abord, les plus anciens ensuite.
-- =====================================================================
create or replace function public.mes_tables_faibles(p_combien integer default 4)
returns smallint[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(t order by score_faiblesse desc), '{}')::smallint[]
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             sum(case m.niveau when 1 then 3 when 2 then 1 else 0 end) as score_faiblesse
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where m.eleve_id = public.eleve_courant()
         and split_part(m.fait, '_', 2)::smallint <= e.plafond_tables
       group by 1
      having sum(case m.niveau when 1 then 3 when 2 then 1 else 0 end) > 0
       order by 2 desc
       limit p_combien
    ) x;
$$;

-- =====================================================================
-- CRÉER UN DÉFI — plafonné au niveau du créateur
-- =====================================================================
create or replace function public.creer_defi(
  p_type    text,
  p_tables  smallint[],
  p_nb_questions integer default 20,
  p_duree_s integer default null,
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
  v_code text; v_id uuid; v_n integer;
  v_ouverts integer;
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

  v_code := public.generer_code_defi();

  insert into public.defis (
    code, type, cree_par_prof, cree_par_eleve, classe,
    tables, questions, duree_s, expire_le)
  values (
    v_code, p_type, v_prof,
    case when v_prof is null then v_eleve end,
    coalesce(p_classe, (select classe from public.eleves where id = v_eleve)),
    p_tables, v_questions,
    case when p_type = 'countdown' then coalesce(p_duree_s, 120) end,
    -- Un défi créé par un élève vit 24 h ; un défi de prof, une semaine.
    now() + case when v_prof is null then interval '24 hours' else p_expire_dans end)
  returning id into v_id;

  return jsonb_build_object(
    'defi_id', v_id, 'code', v_code, 'type', p_type,
    'palier', public.palier_tables(p_tables));
end;
$$;

-- =====================================================================
-- VUE ENSEIGNANT — la maîtrise agrégée d'une classe
-- « 18 élèves sur 27 bloquent sur la table de 7 » : c'est CE chiffre
-- qui fait qu'un prof de maths rouvre l'outil la semaine suivante.
-- =====================================================================
create or replace function public.maitrise_classe(p_classe text)
returns table (
  table_n      smallint,
  eleves_verts integer,
  eleves_jaunes integer,
  eleves_rouges integer,
  eleves_total integer,
  taux_maitrise numeric
)
language sql
security definer
set search_path = public
as $$
  select t::smallint,
         count(*) filter (where niv = 3)::integer,
         count(*) filter (where niv = 2)::integer,
         count(*) filter (where niv = 1)::integer,
         count(*)::integer,
         round(100.0 * count(*) filter (where niv = 3) / nullif(count(*), 0), 0)
    from (
      select split_part(m.fait, '_', 2)::smallint as t,
             m.eleve_id,
             max(m.niveau) as niv
        from public.maitrise m
        join public.eleves e on e.id = m.eleve_id
       where e.classe = p_classe and e.actif
         and public.prof_voit_classe(p_classe)
       group by 1, 2
    ) x
   group by t
   order by t;
$$;

grant execute on function
  public.poids_fait(smallint, smallint),
  public.poids_moyen(smallint[]),
  public.palier_tables(smallint[]),
  public.mes_tables_faibles(integer),
  public.maitrise_classe(text),
  public.classement_records(text, text, text, text, integer),
  public.classement_progression(text, text, text, integer)
to authenticated;
