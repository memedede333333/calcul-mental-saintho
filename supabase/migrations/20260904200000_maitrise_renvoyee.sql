-- =====================================================================
-- MIGRATION 27 — la grille de l'eleve doit bouger apres sa partie
--
-- LE DEFAUT, ET D'OU IL VIENT
--
-- `maitrise` est chargee UNE FOIS, a la connexion (`App.jsx` l. 102).
-- Jusqu'au lot 18, `Practice.jsx` compensait localement : apres chaque
-- partie il faisait `setMastery(prev => ({...prev, ...maitriseSortie}))`
-- avec le resultat calcule dans le navigateur. Le lot 18 a retire ce
-- calcul — a juste titre, la regle appartient au serveur — mais n'a rien
-- mis a la place. Personne ne rafraichit plus rien.
--
-- CE QUI CASSE, ET POUR QUI
--
-- Un eleve termine une partie, ouvre sa grille : rien n'a change. Il
-- rejoue : `buildWeights()` repose les memes questions avec les memes
-- poids, en ignorant ce qu'il vient d'apprendre. La grille est la seule
-- recompense visible du travail, et elle est figee jusqu'a la prochaine
-- connexion. C'est la boucle de retour de toute l'application.
--
-- Le meme trou existait deja pour les defis et les modes de
-- `Challenges.jsx`, qui n'avaient jamais eu de compensation locale.
--
-- LA CORRECTION
--
-- `enregistrer_session` renvoie desormais, dans son resultat, une cle
-- `maitrise` : le niveau A JOUR des SEULS faits touches par la partie.
-- Pas toute la grille — quelques cases, dans la reponse d'un appel qui
-- avait lieu de toute facon. Aucun second appel, aucune regle dans
-- l'ecran, et le chiffre vient de la ou la regle vit.
--
-- `terminer_defi` relaie la meme cle : sans ca, la grille d'un eleve qui
-- ne joue que des defis en classe ne bougerait pas de la seance.
--
-- NUMEROTATION : 20260904200000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 5. `enregistrer_session` — renvoie les faits touches
-- ---------------------------------------------------------------------
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
  p_score_premier_essai integer default null,
  p_faits           jsonb    default null
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
  v_defi_ok    boolean;
  v_f          jsonb;
  v_seuil_ms   integer := public.seuil_reponse_rapide();
  v_rapide     boolean;
  v_serie      smallint;
  v_touches    text[] := '{}';
begin
  if v_eleve is null then
    raise exception 'Compte non reconnu. Reconnecte-toi.' using errcode = '42501';
  end if;

  -- ---- MIGRATION 25 -------------------------------------------------
  -- Ouvrir l'application et quitter aussitot valait 100 points : la
  -- session vide marquait le jour actif, et `progression_detail()`
  -- accorde 100 points par jour actif. Une regle de points ne se garde
  -- pas dans un ecran — on la pose ici, avant toute ecriture.
  if coalesce(p_nb_questions, 0) <= 0 then
    raise exception 'Une partie sans question ne s''enregistre pas.'
      using errcode = 'P0001';
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

  -- ---- LE DEFI FAIT AUTORISATION (migration 21) ----------------------
  -- Le plafond est un anti-triche, pas une limite de programme : il
  -- empeche un eleve de CHOISIR des tables trop hautes pour gonfler ses
  -- points (voir migration 10). Un defi de prof n'est pas un choix
  -- d'eleve, c'est du travail prescrit. On leve donc le plafond — mais
  -- seulement si les TROIS conditions tiennent, toutes relues en base,
  -- aucune tiree d'un parametre que le client controle seul :
  --   1. la session est rattachee a un defi qui existe,
  --   2. l'eleve figure DEJA parmi ses participants (il a joue : c'est
  --      `terminer_defi` qui insere la ligne, avant d'appeler ici),
  --   3. les tables demandees sont EXACTEMENT celles du defi, ni plus
  --      ni moins.
  -- Un client qui invente un p_defi_id, ou qui ajoute une table a celles
  -- du defi, ne gagne rien : il retombe sur le refus habituel.
  v_defi_ok := false;
  if p_defi_id is not null then
    -- Une partie de defi ne s'enregistre qu'UNE fois. `terminer_defi`
    -- est deja protege par la cle primaire de `defis_participants`,
    -- mais un appel direct a `enregistrer_session` avec le meme
    -- p_defi_id ne l'etait pas : verifie en base, la session comptait
    -- une seconde fois. Le trou existait avant cette migration ; elle
    -- en augmente la valeur (les tables d'un defi de prof peuvent
    -- desormais etre plus lourdes que le plafond), donc on le ferme ici.
    if exists (select 1 from public.sessions_jeu
                where eleve_id = v_eleve and defi_id = p_defi_id) then
      raise exception 'Tu as deja enregistre ce defi.' using errcode = 'P0001';
    end if;

    select true into v_defi_ok
      from public.defis d
      join public.defis_participants dp
        on dp.defi_id = d.id and dp.eleve_id = v_eleve
     where d.id = p_defi_id
       and coalesce(p_tables, '{}'::smallint[]) @> d.tables
       and coalesce(p_tables, '{}'::smallint[]) <@ d.tables;
    v_defi_ok := coalesce(v_defi_ok, false);
  end if;

  if not v_defi_ok
     and p_tables is not null
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
  -- MIGRATION 26 : la regle de maitrise est ICI, plus dans l'ecran.
  --
  -- Le front envoie `p_faits`, un TABLEAU de reponses DANS L'ORDRE ou
  -- elles ont ete donnees. Chaque entree est brute — ce que l'eleve a
  -- fait, pas ce qu'un ecran en a conclu :
  --   {"fait":"7_8", "juste":true, "premier":true, "temps_ms":2400}
  --
  -- La regle, appliquee entree par entree :
  --   faux                          -> rouge (1), serie remise a 0
  --   juste apres rattrapage        -> orange (2), serie remise a 0
  --   juste du premier coup, LENT   -> orange (2), serie remise a 0
  --   juste du premier coup, RAPIDE -> serie + 1
  --                                    serie >= 2 -> vert (3)
  --                                    serie  = 1 -> orange (2)
  --
  -- Le niveau EST l'etat de la serie : vert veut dire « deux fois de
  -- suite, sans hesiter ». Un fait vert repondu lentement redescend en
  -- orange, et deux reponses rapides le remontent. C'est ce qui donne
  -- son sens au vert — sinon il ne mesure qu'une reussite ancienne.
  --
  -- L'ordre du tableau compte : un meme fait pose deux fois dans la
  -- partie se traite deux fois, dans l'ordre. Il n'y a plus de « pire
  -- resultat de la session » — une serie ne se calcule pas sur un
  -- resume.
  if p_faits is not null then
    for v_f in select value from jsonb_array_elements(p_faits)
    loop
      v_fait   := v_f->>'fait';
      continue when v_fait is null or v_fait = '';
      -- MIGRATION 27 : on retient les faits touches pour les renvoyer
      -- a l'ecran avec leur nouveau niveau. Voir la section 5.
      if not (v_fait = any(v_touches)) then
        v_touches := v_touches || v_fait;
      end if;

      v_rapide := coalesce((v_f->>'juste')::boolean, false)
              and coalesce((v_f->>'premier')::boolean, false)
              and coalesce((v_f->>'temps_ms')::integer, 2147483647) < v_seuil_ms;

      select coalesce(serie_rapide, 0) into v_serie
        from public.maitrise where eleve_id = v_eleve and fait = v_fait;
      v_serie := coalesce(v_serie, 0);

      if v_rapide then
        v_serie  := least(v_serie + 1, 32000);
        v_niveau := case when v_serie >= 2 then 3 else 2 end;
      else
        v_serie  := 0;
        v_niveau := case when coalesce((v_f->>'juste')::boolean, false)
                         then 2 else 1 end;
      end if;

      insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites,
                                   derniere_vue, serie_rapide, dernier_temps_ms)
      values (v_eleve, v_fait, v_niveau, 1,
              case when v_niveau >= 2 then 1 else 0 end,
              now(), v_serie, (v_f->>'temps_ms')::integer)
      on conflict (eleve_id, fait) do update
        set niveau           = excluded.niveau,
            nb_vues          = public.maitrise.nb_vues + 1,
            nb_reussites     = public.maitrise.nb_reussites
                               + case when excluded.niveau >= 2 then 1 else 0 end,
            derniere_vue     = now(),
            serie_rapide     = excluded.serie_rapide,
            dernier_temps_ms = excluded.dernier_temps_ms;
    end loop;

  else
    -- Ancien client : il envoie encore `p_maitrise` avec un niveau deja
    -- calcule. On l'accepte tel quel pendant la periode ou la base est
    -- migree et le front pas encore deploye. La serie n'est pas touchee
    -- — on ne devine pas une serie a partir d'un resume.
    for v_fait, v_niveau in
      select key, value::text::smallint from jsonb_each(coalesce(p_maitrise, '{}'))
    loop
      if not (v_fait = any(v_touches)) then
        v_touches := v_touches || v_fait;
      end if;
      insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites, derniere_vue)
      values (v_eleve, v_fait, v_niveau, 1, case when v_niveau >= 2 then 1 else 0 end, now())
      on conflict (eleve_id, fait) do update
        set niveau       = excluded.niveau,
            nb_vues      = public.maitrise.nb_vues + 1,
            nb_reussites = public.maitrise.nb_reussites
                           + case when excluded.niveau >= 2 then 1 else 0 end,
            derniere_vue = now();
    end loop;
  end if;

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
    'nouveaux_badges', to_jsonb(v_nouveaux),
    -- MIGRATION 27 : le niveau A JOUR des seuls faits touches par cette
    -- partie. L'ecran les pose dans sa grille sans rien recalculer et
    -- sans un second appel. Voir la section 5.
    'maitrise',        coalesce((
                         select jsonb_object_agg(m.fait, m.niveau)
                           from public.maitrise m
                          where m.eleve_id = v_eleve
                            and m.fait = any(v_touches)), '{}'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 6. `terminer_defi` — relaie la meme cle
-- ---------------------------------------------------------------------
create or replace function public.terminer_defi(
  p_defi_id  uuid,
  p_score    integer,
  p_temps_s  numeric,
  p_erreurs  integer default 0,
  p_detail   jsonb   default '{}',
  p_maitrise jsonb   default '{}',
  p_score_premier_essai integer default null,
  p_faits    jsonb   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
  v_res   jsonb;
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

  v_res := public.enregistrer_session(
    p_mode           => v_defi.type,
    p_tables         => v_defi.tables,
    p_nb_questions   => p_score + p_erreurs,
    p_score          => p_score,
    p_duree_s        => p_temps_s,
    p_sans_faute_max => 0,
    p_maitrise       => p_maitrise,
    p_defi_id        => p_defi_id,
    p_score_premier_essai => p_score_premier_essai,
    -- MIGRATION 26 : sans cette ligne, un defi n'alimente plus la
    -- maitrise du tout. Voir le commentaire de la section 4.
    p_faits          => p_faits
  );

  -- MIGRATION 27 : on relaie la maitrise mise a jour, comme les modes
  -- solo. Sans ca, la grille d'un eleve qui ne joue que des defis ne
  -- bougerait pas de la seance.
  return jsonb_build_object(
    'ok', true,
    'maitrise', coalesce(v_res->'maitrise', '{}'::jsonb));
end;
$$;

comment on function public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric, integer, integer,
  smallint, jsonb, uuid, integer, jsonb) is
  'Enregistre une partie d''eleve. LA REGLE DE MAITRISE EST ICI (migration 26) : le front envoie `p_faits`, un tableau de reponses brutes dans l''ordre — {fait, juste, premier, temps_ms} — et le serveur en deduit le niveau. Deux reponses justes du premier coup sous seuil_reponse_rapide() d''affilee = vert ; juste mais lent ou rattrape = orange, serie remise a zero ; faux = rouge. RENVOIE (migration 27) une cle `maitrise` : le niveau a jour des seuls faits touches par cette partie, pour que l''ecran mette sa grille a jour sans second appel et sans recalculer quoi que ce soit. Refuse par ailleurs une partie a zero question (migration 25), un score superieur au nombre de questions, un score de premier essai superieur au score, une seconde session sur le meme defi, et des tables au-dela du plafond — sauf defi dont l''eleve est deja participant et dont les tables correspondent exactement (migration 21).';

comment on function public.terminer_defi(
  uuid, integer, numeric, integer, jsonb, jsonb, integer, jsonb) is
  'Enregistre la participation a un defi, puis delegue a enregistrer_session(). Relaie `p_faits` (migration 26) et renvoie la cle `maitrise` mise a jour (migration 27), comme les modes solo. Les modes solo appellent enregistrer_session() directement ; les defis passent par ici. Toute modification du contrat de l''un doit etre repercutee sur l''autre.';
