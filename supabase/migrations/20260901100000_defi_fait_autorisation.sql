-- =====================================================================
-- Calcul Mental Saintho
-- Migration 21 : le defi fait autorisation
-- =====================================================================
--
-- CONSTAT (relecture du 1er septembre 2026, verifie en base)
--
--   prof -> creer_defi('sprint','{15}')   -> code W2NEZ
--   Alice (plafond 12) -> rejoindre_defi  -> ok: true, questions livrees
--   Alice enregistre  -> REFUS : « Tu n'as pas encore debloque la table 15. »
--
-- `creer_defi` n'impose aucun plafond de tables a un professeur ;
-- `enregistrer_session` en impose un a l'eleve. Entre les deux, l'eleve
-- joue les vingt questions puis voit son score refuse. Elle n'a rien
-- fait de mal : c'est le prof qui a choisi les tables.
--
-- DECISION (Aymeri, 1er septembre 2026)
--
-- Le plafond est un ANTI-TRICHE, pas une limite de programme. La
-- migration 10 le dit elle-meme : sans lui, cocher une table haute
-- serait « le moyen simple de gonfler ses points ». Il empeche un eleve
-- de CHOISIR des tables trop hautes en solo. Un defi de prof n'est pas
-- un choix d'eleve, c'est du travail prescrit — et un prof de 3e qui
-- veut faire travailler la table de 15 a sa classe a le droit d'avoir
-- raison. Ce n'est pas a un mecanisme de jeu de lui opposer un veto.
--
-- Donc : le defi fait autorisation. `enregistrer_session` accepte les
-- tables du defi auquel l'eleve a REELLEMENT participe, et strictement
-- rien d'autre. Son refus reste entier pour tout le reste — l'anti-
-- triche du jeu solo n'est pas touche.
--
-- CE QUI REND CE CHOIX SUR
--
-- 1. Les trois conditions de la levee sont relues EN BASE, jamais tirees
--    d'un parametre : le defi existe, l'eleve est deja dans
--    `defis_participants`, et les tables demandees sont exactement
--    celles de la ligne `defis`. Un p_defi_id invente ne donne rien.
-- 2. `terminer_defi` passe deja `p_tables => v_defi.tables` : le client
--    ne choisit pas les tables d'un defi, il les recoit.
-- 3. La migration 10 garantit qu'une table haute jouee hors mode Montee
--    ne debloque rien : `plus_haute_table` n'est retenue que si
--    `p_mode = 'climb'`, et un defi est 'sprint' ou 'countdown'. Un defi
--    sur la 15 ne fera donc monter le plafond de personne.
--
-- ET LE PROF N'APPREND RIEN APRES COUP
--
-- `creer_defi` renvoie desormais `eleves_hors_plafond` et
-- `eleves_classe` — les deux populations, jamais l'une sans l'autre —
-- et `apercu_defi_classe()` permet de poser la question AVANT de creer :
-- « 12 eleves sur 27 n'ont pas encore debloque la table 15, lancer
-- quand meme ? ». Le prof decide en connaissance de cause ; l'ecran ne
-- calcule rien, il affiche ce que le serveur lui donne.
--
-- NUMEROTATION : la 19 avait ete datee dans le futur (20260901080000
-- appliquee a 00:00) et la 20 a du la depasser. Cette migration porte
-- 20260901100000 pour la meme raison — pas l'heure reelle de son
-- ecriture, mais la premiere heure disponible au-dessus de la 20. La
-- dette se resorbe d'elle-meme des que l'horloge passe 10 h.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. enregistrer_session : le plafond cede devant un defi, et rien d'autre
-- ---------------------------------------------------------------------
drop function if exists public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid, integer);

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
  v_defi_ok    boolean;
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

comment on function public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric,
  integer, integer, smallint, jsonb, uuid, integer) is
  'Enregistre une partie et met a jour maitrise, badges et points. Le plafond de tables de l''eleve est verifie SAUF si la session est rattachee a un defi auquel il participe deja et dont les tables sont exactement p_tables : le defi fait autorisation (migration 21). Le plafond reste un anti-triche pour tout choix libre de tables.';


-- ---------------------------------------------------------------------
-- 2. creer_defi : ne refuse pas, mais dit combien d'eleves sont concernes
-- ---------------------------------------------------------------------

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
$$;

comment on function public.creer_defi(text, smallint[], integer, integer, text, interval) is
  'Cree un defi. Un eleve reste plafonne a son propre niveau debloque ; un professeur ne l''est pas. Renvoie `eleves_hors_plafond` ET `eleves_classe` — populations : les deux comptent les eleves ACTIFS de `classe`, le premier ceux dont plafond_tables < table_max. Le defi part quand meme : ce chiffre sert a informer le professeur, pas a lui opposer un veto.';


-- ---------------------------------------------------------------------
-- 3. apercu_defi_classe : poser la question AVANT de creer
-- ---------------------------------------------------------------------
create or replace function public.apercu_defi_classe(
  p_classe text,
  p_tables smallint[]
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'classe',              p_classe,
    'table_max',           (select max(x) from unnest(p_tables) x),
    'eleves_classe',       count(*),
    'eleves_hors_plafond', count(*) filter (
                             where e.plafond_tables
                                 < (select max(x) from unnest(p_tables) x)))
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and public.prof_voit_classe(p_classe);
$$;

grant execute on function public.apercu_defi_classe(text, smallint[]) to authenticated;

comment on function public.apercu_defi_classe(text, smallint[]) is
  'Avant de creer un defi de classe : combien d''eleves n''ont pas encore debloque la plus haute table choisie. Populations : `eleves_classe` et `eleves_hors_plafond` comptent tous deux les eleves ACTIFS de `p_classe` — jamais un ratio dont les deux cotes viendraient d''ensembles differents. Reserve aux enseignants (prof_voit_classe) : un eleve obtient 0 partout.';
