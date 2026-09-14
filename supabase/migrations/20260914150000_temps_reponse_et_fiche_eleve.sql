-- =====================================================================
-- Calcul Mental Saintho
-- Migration 46 : le temps de réponse, et la fiche d'un élève (lot A)
-- =====================================================================
-- LOT A du module « micro / macro » : tout ce qui concerne UN élève.
-- Le comparateur (lot B) viendra ensuite, sur les mêmes fonctions, une
-- fois qu'on les aura regardées en vrai sur un élève.
--
-- CE QUI MANQUAIT, ET CE QUE ÇA COÛTE
-- `maitrise` gardait `dernier_temps_ms` : le temps de la DERNIÈRE
-- réponse sur ce fait. Il répond à « il a mis 4,2 s la dernière fois »,
-- jamais à « il met combien de temps, d'habitude ». Or c'est la seconde
-- question qui intéresse un professeur.
-- Les temps arrivent pourtant du client à chaque partie, dans `p_faits`
-- (migration 26) — ils servaient à calculer la maîtrise, puis ils
-- étaient jetés.
-- On ajoute donc la SOMME et le NOMBRE. Une moyenne vraie, et **zéro
-- ligne de stockage de plus** : `maitrise` reste à une ligne par élève
-- et par fait. Un historique réponse par réponse aurait donné la même
-- moyenne pour ~2 millions de lignes par an — à garder pour le jour où
-- l'on voudra rejouer une partie question par question, pas avant.
--
-- UN SEUL ÉCRIVAIN, VÉRIFIÉ
-- `enregistrer_session` est la seule fonction qui écrive dans
-- `maitrise` (vérifié en base sur `pg_proc.prosrc`), et `terminer_defi`
-- la délègue au lieu d'en tenir une copie. Le piège de la migration 26
-- — `p_faits` ajouté ici et oublié là — ne se pose donc pas : une seule
-- insertion à modifier, et les défis en bénéficient du même coup.
-- Le texte ci-dessous est celui de la fonction en base, avec la
-- modification insérée dedans. Jamais un corps reconstitué de mémoire.
--
-- LES POPULATIONS, ENCORE
-- Une moyenne bâtie sur une seule réponse n'est pas une moyenne. Toutes
-- les fonctions renvoient donc `nb_temps` / `nb_reponses_mesurees` à
-- côté de chaque moyenne, et `null` — jamais `0` — quand rien n'a été
-- mesuré. L'écran doit pouvoir écrire « 4,2 s sur 37 réponses », ou ne
-- rien écrire du tout.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. DEUX COLONNES, ET LE PASSÉ QU'ON SAIT RÉCUPÉRER
-- ---------------------------------------------------------------------
alter table public.maitrise
  add column if not exists somme_temps_ms bigint  not null default 0,
  add column if not exists nb_temps       integer not null default 0;

-- Amorçage : le dernier temps connu vaut une mesure. C'est un seul
-- échantillon par fait, et c'est assumé — sans lui, tous les élèves
-- auraient une moyenne vide le jour de la mise en service, et personne
-- ne saurait si l'outil est cassé ou si la base est neuve.
update public.maitrise
   set somme_temps_ms = dernier_temps_ms,
       nb_temps       = 1
 where dernier_temps_ms is not null
   and nb_temps = 0;

comment on column public.maitrise.somme_temps_ms is
  'Somme des temps de reponse mesures sur ce fait, en millisecondes. Avec `nb_temps`, donne la moyenne. Alimente par `enregistrer_session` (migration 46).';
comment on column public.maitrise.nb_temps is
  'Nombre de reponses dont le temps a ete mesure sur ce fait. DENOMINATEUR de la moyenne : une moyenne sur 1 reponse n''est pas une moyenne, l''ecran doit pouvoir l''afficher.';


-- ---------------------------------------------------------------------
-- 2. `enregistrer_session` ACCUMULE AU LIEU D'ÉCRASER
-- ---------------------------------------------------------------------
-- Signature inchangee : `create or replace` suffit, aucun `drop`.
CREATE OR REPLACE FUNCTION public.enregistrer_session(p_mode text, p_tables smallint[], p_nb_questions integer, p_score integer, p_erreurs jsonb DEFAULT '[]'::jsonb, p_duree_s numeric DEFAULT 0, p_serie_max integer DEFAULT 0, p_sans_faute_max integer DEFAULT 0, p_plus_haute_table smallint DEFAULT NULL::smallint, p_maitrise jsonb DEFAULT '{}'::jsonb, p_defi_id uuid DEFAULT NULL::uuid, p_score_premier_essai integer DEFAULT NULL::integer, p_faits jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

      -- MIGRATION 46 : on accumule le temps de reponse au lieu de ne
      -- garder que le dernier. `dernier_temps_ms` disait « il a mis 4,2 s
      -- la derniere fois » ; la somme et le compte disent « il met 4,2 s
      -- en moyenne, sur 37 reponses ». C'est la seconde qui permet de
      -- repondre a « il est lent sur quoi », et elle ne coute pas une
      -- ligne de stockage de plus.
      insert into public.maitrise (eleve_id, fait, niveau, nb_vues, nb_reussites,
                                   derniere_vue, serie_rapide, dernier_temps_ms,
                                   somme_temps_ms, nb_temps)
      values (v_eleve, v_fait, v_niveau, 1,
              case when v_niveau >= 2 then 1 else 0 end,
              now(), v_serie, (v_f->>'temps_ms')::integer,
              coalesce((v_f->>'temps_ms')::integer, 0),
              case when (v_f->>'temps_ms') is null then 0 else 1 end)
      on conflict (eleve_id, fait) do update
        set niveau           = excluded.niveau,
            nb_vues          = public.maitrise.nb_vues + 1,
            nb_reussites     = public.maitrise.nb_reussites
                               + case when excluded.niveau >= 2 then 1 else 0 end,
            derniere_vue     = now(),
            serie_rapide     = excluded.serie_rapide,
            dernier_temps_ms = excluded.dernier_temps_ms,
            somme_temps_ms   = public.maitrise.somme_temps_ms
                               + coalesce(excluded.dernier_temps_ms, 0),
            nb_temps         = public.maitrise.nb_temps
                               + case when excluded.dernier_temps_ms is null
                                      then 0 else 1 end;
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
$function$;

grant execute on function public.enregistrer_session(text, smallint[], integer, integer, jsonb, numeric, integer, integer, smallint, jsonb, uuid, integer, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 3. LA FICHE D'UN ÉLÈVE — un seul appel, deux niveaux de lecture
-- ---------------------------------------------------------------------
-- Une seule fonction, et `portee` dit ce qu'elle a renvoyé : un
-- enseignant reçoit le travail scolaire, un administrateur reçoit en
-- plus le bloc `horaires`. Même écran, un bloc en moins — plutôt que
-- deux écrans à tenir à jour.
--
-- `portee` est explicite pour que React n'ait rien à deviner : un bloc
-- absent ne se distingue pas d'un bloc vide, et cinq bugs de ce projet
-- viennent d'un écran qui a conclu à la place du serveur.
create or replace function public.fiche_eleve(
  p_eleve_id uuid,
  p_jours    int default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  e        public.eleves%rowtype;
  v_depuis timestamptz;
  v_admin  boolean;
  v_res    jsonb;
  v_deb    time;
  v_fin    time;
  v_franchit boolean;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  v_admin  := public.est_admin();
  p_jours  := least(greatest(coalesce(p_jours, 30), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  select * into e from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;

  select heure_debut, heure_fin into v_deb, v_fin from public.couvre_feu;
  v_franchit := v_deb > v_fin;

  select jsonb_build_object(
    'portee', case when v_admin then 'admin' else 'prof' end,
    'jours',  p_jours,
    'depuis', v_depuis,

    'identite', jsonb_build_object(
      'eleve_id', e.id, 'prenom', e.prenom, 'nom', e.nom, 'classe', e.classe,
      'avatar_emoji', e.avatar_emoji, 'actif', e.actif,
      'plafond_tables', e.plafond_tables,
      'palier', public.palier_de_plafond(e.plafond_tables)),

    -- Volume et rythme. `null` et non `0` quand il n'y a rien : une
    -- absence de donnee n'est pas une valeur (lot 16 bis).
    'volume', (
      select jsonb_build_object(
        'nb_parties',          count(*),
        'temps_partie_s',      coalesce(sum(s.duree_s), 0)::int,
        'jours_actifs',        count(distinct (s.cree_le at time zone 'Europe/Paris')::date),
        'duree_moyenne_partie_s',
          case when count(*) = 0 then null else (sum(s.duree_s) / count(*))::int end,
        'parties_par_jour_actif',
          case when count(distinct (s.cree_le at time zone 'Europe/Paris')::date) = 0 then null
               else round(count(*)::numeric
                    / count(distinct (s.cree_le at time zone 'Europe/Paris')::date), 1) end,
        'premiere_partie',     min(s.cree_le),
        'derniere_partie',     max(s.cree_le),
        'par_mode', coalesce((
          select jsonb_object_agg(m.mode, m.n)
            from (select sj.mode, count(*) as n from public.sessions_jeu sj
                   where sj.eleve_id = p_eleve_id and sj.cree_le >= v_depuis
                   group by sj.mode) m), '{}'::jsonb))
        from public.sessions_jeu s
       where s.eleve_id = p_eleve_id and s.cree_le >= v_depuis),

    -- LE TEMPS DE REPONSE. Deux mesures differentes, nommees comme
    -- telles : la moyenne par REPONSE vient de `maitrise` (mesuree
    -- question par question), celle par QUESTION vient des parties
    -- (duree totale / nombre de questions) et inclut donc la lecture de
    -- l'enonce et la frappe. Les confondre donnerait deux chiffres qui
    -- ne collent pas, et personne ne saurait lequel croire.
    'rapidite', (
      select jsonb_build_object(
        'temps_moyen_reponse_ms',
          case when sum(m.nb_temps) = 0 then null
               else (sum(m.somme_temps_ms) / sum(m.nb_temps))::int end,
        'nb_reponses_mesurees', coalesce(sum(m.nb_temps), 0),
        'seuil_rapide_ms',      public.seuil_reponse_rapide(),
        'faits_sous_le_seuil',
          count(*) filter (where m.nb_temps > 0
                             and m.somme_temps_ms / m.nb_temps < public.seuil_reponse_rapide()),
        'faits_mesures',        count(*) filter (where m.nb_temps > 0))
        from public.maitrise m
       where m.eleve_id = p_eleve_id),

    -- La grille : on compte les CASES AFFICHEES, pas les entrees de la
    -- table. `maitrise` est indexee par `min_max`, donc 4x7 et 7x4 sont
    -- la meme entree : au plafond 10, la grille montre 100 cases pour au
    -- plus 55 entrees. Compter les entrees divisait le score par deux.
    'maitrise', (
      select jsonb_build_object(
        'cases_affichees', (e.plafond_tables::int * e.plafond_tables::int),
        'vertes',   count(*) filter (where m.niveau = 3),
        'oranges',  count(*) filter (where m.niveau = 2),
        'rouges',   count(*) filter (where m.niveau = 1),
        'jamais_vues', greatest(
           (e.plafond_tables::int * e.plafond_tables::int) - count(*), 0))
        from public.maitrise m
       where m.eleve_id = p_eleve_id),

    'defis', jsonb_build_object(
      'crees',    (select count(*) from public.defis d
                    where d.cree_par_eleve = p_eleve_id and d.cree_le >= v_depuis),
      'rejoints', (select count(*) from public.defis_presences dp
                    where dp.eleve_id = p_eleve_id),
      'termines', (select count(*) from public.defis_participants dpa
                    where dpa.eleve_id = p_eleve_id and dpa.termine_le >= v_depuis),
      'meilleur_score', (select max(dpa.score) from public.defis_participants dpa
                          where dpa.eleve_id = p_eleve_id and dpa.termine_le >= v_depuis)),

    'badges', coalesce((select jsonb_agg(b.badge_id order by b.badge_id)
                          from public.badges b where b.eleve_id = p_eleve_id), '[]'::jsonb),

    -- Reserve a l'administrateur, et ABSENT — pas vide — pour un
    -- enseignant. `portee` dit lequel des deux cas on est.
    'horaires', case when not v_admin then null else (
      select jsonb_build_object(
        'par_heure', coalesce((
          select jsonb_agg(jsonb_build_object('heure', h.heure, 'nb_parties', h.n)
                           order by h.heure)
            from (select extract(hour from sj.cree_le at time zone 'Europe/Paris')::int as heure,
                         count(*) as n
                    from public.sessions_jeu sj
                   where sj.eleve_id = p_eleve_id and sj.cree_le >= v_depuis
                   group by 1) h), '[]'::jsonb),
        'parties_couvre_feu', (
          select count(*) from public.sessions_jeu sj
           where sj.eleve_id = p_eleve_id and sj.cree_le >= v_depuis
             and case when v_franchit
                      then (sj.cree_le at time zone 'Europe/Paris')::time >= v_deb
                        or (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
                      else (sj.cree_le at time zone 'Europe/Paris')::time >= v_deb
                       and (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
                 end),
        'derniere_connexion', e.derniere_connexion)
    ) end
  ) into v_res;

  return v_res;
end;
$$;

comment on function public.fiche_eleve(uuid, int) is
  'La fiche complete d''un eleve sur une periode glissante, en UN appel. `portee` vaut ''prof'' ou ''admin'' et dit ce qui a ete renvoye : le bloc `horaires` (histogramme par heure, parties pendant le couvre-feu, derniere connexion) n''est present que pour un administrateur. Toute moyenne est accompagnee de son denominateur, et vaut null — jamais 0 — quand rien n''a ete mesure.';

grant execute on function public.fiche_eleve(uuid, int) to authenticated;


-- ---------------------------------------------------------------------
-- 4. LA COURBE — un point par jour
-- ---------------------------------------------------------------------
-- « Est-ce qu'il devient plus rapide ? » ne se lit pas sur un chiffre,
-- seulement sur une suite. `secondes_par_question` est disponible pour
-- TOUTES les parties passees, y compris celles d'avant la migration 46 :
-- c'est la seule mesure de rapidite qui ait un historique.
create or replace function public.fiche_eleve_rythme(
  p_eleve_id uuid,
  p_jours    int default 30
)
returns table (
  jour                  date,
  nb_parties            integer,
  temps_partie_s        integer,
  nb_questions          integer,
  secondes_par_question numeric
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
    select (sj.cree_le at time zone 'Europe/Paris')::date,
           count(*)::integer,
           coalesce(sum(sj.duree_s), 0)::integer,
           coalesce(sum(sj.nb_questions), 0)::integer,
           case when coalesce(sum(sj.nb_questions), 0) = 0 then null
                else round(sum(sj.duree_s) / sum(sj.nb_questions), 2) end
      from public.sessions_jeu sj
     where sj.eleve_id = p_eleve_id and sj.cree_le >= v_depuis
     group by 1
     order by 1;
end;
$$;

comment on function public.fiche_eleve_rythme(uuid, int) is
  'Un point par JOUR OU L''ELEVE A JOUE — les jours sans partie ne sont pas des lignes a zero, ils sont absents, et c''est a l''ecran de dessiner les creux. `secondes_par_question` est la duree totale divisee par le nombre de questions : elle inclut la lecture de l''enonce et la frappe, contrairement au temps de reponse de `fiche_eleve_faits`. Reserve aux enseignants.';

grant execute on function public.fiche_eleve_rythme(uuid, int) to authenticated;


-- ---------------------------------------------------------------------
-- 5. LE DÉTAIL PAR MULTIPLICATION — « il est lent sur quoi »
-- ---------------------------------------------------------------------
create or replace function public.fiche_eleve_faits(p_eleve_id uuid)
returns table (
  fait            text,
  niveau          smallint,
  nb_vues         integer,
  nb_reussites    integer,
  taux_reussite   numeric,
  temps_moyen_ms  integer,
  nb_temps        integer,
  derniere_vue    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;

  return query
    select m.fait, m.niveau, m.nb_vues, m.nb_reussites,
           case when m.nb_vues = 0 then null
                else round(m.nb_reussites::numeric / m.nb_vues, 2) end,
           -- La moyenne n'existe que s'il y a eu des mesures. `nb_temps`
           -- part avec elle : « 4,2 s » et « 4,2 s sur 37 reponses » ne
           -- se lisent pas pareil, et c'est le second qui est honnete.
           case when m.nb_temps = 0 then null
                else (m.somme_temps_ms / m.nb_temps)::integer end,
           m.nb_temps,
           m.derniere_vue
      from public.maitrise m
     where m.eleve_id = p_eleve_id
     order by m.niveau, (case when m.nb_temps = 0 then null
                              else m.somme_temps_ms / m.nb_temps end) desc nulls last;
end;
$$;

comment on function public.fiche_eleve_faits(uuid) is
  'Une ligne par multiplication DEJA RENCONTREE par l''eleve — celles qu''il n''a jamais vues ne sont pas des lignes a zero, elles sont absentes ; leur nombre est dans `fiche_eleve` sous `maitrise.jamais_vues`. Trie du plus fragile au plus solide, puis du plus lent au plus rapide. `temps_moyen_ms` vaut null tant qu''aucun temps n''a ete mesure, et `nb_temps` dit sur combien de reponses la moyenne est batie. Reserve aux enseignants.';

grant execute on function public.fiche_eleve_faits(uuid) to authenticated;
