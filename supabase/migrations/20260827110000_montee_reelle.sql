-- =====================================================================
-- Calcul Mental Saintho
-- Migration 10 : la montee des tables ne se gagne qu'en Montee
-- =====================================================================
--
-- CONSTAT (revue de l'etape 2, 27 aout 2026)
--
-- `enregistrer_session()` accordait les badges `climb_10`, `climb_12`,
-- `climb_15`, `climb_20` des que `p_plus_haute_table` atteignait le
-- seuil — quel que soit le mode.
--
-- Or le front envoie, en entrainement libre comme en defi, la plus
-- grande table COCHEE dans le selecteur. Un eleve qui coche la table 10
-- et repond a trois questions decrochait donc `climb_10`, sans avoir
-- jamais joue la Montee. Le badge le plus symbolique du jeu devenait le
-- plus facile a obtenir.
--
-- Meme raisonnement pour la colonne `sessions_jeu.plus_haute_table`,
-- qui alimente le classement « montee » : elle enregistrait un choix de
-- selecteur, pas une performance.
--
-- CORRECTIF : la valeur n'est retenue que si `p_mode = 'climb'`.
-- On corrige EN BASE et pas seulement dans le front : un client peut
-- toujours mentir, la base non.
--
-- Rien d'autre ne change dans la fonction.
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
  v_montee     smallint;   -- table atteinte EN MONTEE, null ailleurs
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
    raise exception 'Tu n''as pas encore debloque la table %. Passe par la Montee des tables.',
      (select max(x) from unnest(p_tables) x)
      using errcode = 'P0001';
  end if;

  -- Seule la Montee des tables temoigne d'une table « atteinte ».
  -- Ailleurs, `p_plus_haute_table` n'est que la plus grande table cochee
  -- dans le selecteur — la retenir distribuerait les badges climb_* a
  -- qui coche 10 en entrainement libre.
  v_montee := case when p_mode = 'climb' then p_plus_haute_table else null end;

  v_points := round(p_score * public.poids_moyen(p_tables) * 10);
  v_palier := public.palier_tables(p_tables);

  insert into public.sessions_jeu (
    eleve_id, defi_id, mode, tables, nb_questions, score,
    erreurs, duree_s, serie_max, sans_faute_max, plus_haute_table,
    points, palier)
  values (
    v_eleve, p_defi_id, p_mode, coalesce(p_tables, '{}'), p_nb_questions, p_score,
    coalesce(p_erreurs, '[]'), p_duree_s, p_serie_max, p_sans_faute_max,
    v_montee, v_points, v_palier)
  returning id into v_session_id;

  -- ---- Déblocage par la Montée des tables ----------------------------
  -- Franchir la table N en Montée débloque la table N+1 en entraînement.
  if coalesce(v_montee, 0) >= v_plafond then
    update public.eleves
       set plafond_tables = least(20, coalesce(v_montee, 0) + 1)
     where id = v_eleve
       and plafond_tables < least(20, coalesce(v_montee, 0) + 1);
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
    'plafond_tables',  (select plafond_tables from public.eleves where id = v_eleve),
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;
