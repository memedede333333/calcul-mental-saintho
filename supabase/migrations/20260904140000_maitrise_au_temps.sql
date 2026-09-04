-- =====================================================================
-- MIGRATION 26 — la regle de maitrise passe au serveur, et devient
--                une regle de TEMPS
--
-- CE QUI CHANGE, ET POURQUOI
--
-- Jusqu'ici la regle etait dans le navigateur : `construireMaitrise()`
-- decidait 3 (juste du premier coup), 2 (rattrape) ou 1 (jamais trouve),
-- et `enregistrer_session` se contentait de stocker ce chiffre. Deux
-- problemes.
--
-- 1. La regle etait au mauvais endroit. Tout le reste de la logique
--    metier est en PL/pgSQL ; celle-la seule vivait dans un ecran, donc
--    dans un fichier que chaque deploiement peut changer sans que la
--    base le sache.
-- 2. Elle mesurait la bonne reponse, pas l'automatisme. Un eleve qui
--    trouve 7x8 en huit secondes en comptant sur ses doigts obtenait le
--    meme vert que celui qui repond sans reflechir. Or les tables se
--    travaillent precisement pour ne plus avoir a reflechir.
--
-- LA NOUVELLE REGLE — decidee par Aymeri
--
--   vert (3)   : DEUX reponses justes d'affilee, du premier coup,
--                chacune en moins de trois secondes
--   orange (2) : juste, mais lent, ou rattrape, ou une seule reussite
--                rapide pour l'instant
--   rouge (1)  : faux
--
-- Le niveau EST l'etat de la serie. Consequence a connaitre : un fait
-- deja vert repondu lentement REDESCEND en orange. C'est voulu — sinon
-- le vert ne dit plus « je la sais », il dit « je l'ai su une fois ».
-- Deux reponses rapides le remontent.
--
-- LE SEUIL EST A UN SEUL ENDROIT : `seuil_reponse_rapide()`. Le changer
-- se fait en une ligne, sans toucher a une seule requete.
--
-- CE QUE LE FRONT ENVOIE MAINTENANT
--
--   p_faits = [{"fait":"7_8","juste":true,"premier":true,"temps_ms":2400},
--              {"fait":"6_9","juste":false,"premier":false,"temps_ms":5100}]
--
-- Un TABLEAU, dans l'ORDRE des reponses, une entree par question
-- repondue. Plus une map resumee : une serie ne se calcule pas sur un
-- resume, et un fait pose deux fois dans la meme partie doit compter
-- deux fois, dans l'ordre.
--
-- COMPATIBILITE. `p_maitrise` reste accepte. Tant que le front deploye
-- envoie l'ancienne map, la base l'applique comme avant sans toucher a
-- la serie. La migration peut donc etre appliquee AVANT le deploiement
-- du front sans rien casser — c'est ce qui permet de ne pas avoir a
-- synchroniser les deux a la minute pres.
--
-- LES FAITS DEJA VERTS GARDENT LEUR VERT. Les lignes existantes au
-- niveau 3 demarrent avec une serie de 2. Sans ca, tous les verts de
-- tous les eleves seraient retrogrades en orange a leur prochaine
-- reponse, et l'application aurait eu l'air de perdre leur travail.
--
-- NUMEROTATION : 20260904140000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LE SEUIL — un seul endroit
-- ---------------------------------------------------------------------
create or replace function public.seuil_reponse_rapide()
returns integer
language sql
immutable
set search_path = public
as $$ select 3000; $$;

comment on function public.seuil_reponse_rapide() is
  'Le nombre de millisecondes en dessous duquel une reponse juste du premier coup compte comme automatique. Seul endroit ou ce seuil est ecrit : le changer ici le change partout. 3000 ms = trois secondes, la duree d''une question de Sprint.';

grant execute on function public.seuil_reponse_rapide() to authenticated;


-- ---------------------------------------------------------------------
-- 2. DEUX COLONNES SUR `maitrise`
--
-- `serie_rapide` : combien de reponses rapides d'affilee sur ce fait.
--                  C'est elle qui porte la regle ; `niveau` n'en est que
--                  la traduction en couleur.
-- `dernier_temps_ms` : le temps de la derniere reponse. Sert au
--                  diagnostic et a une eventuelle regle plus fine plus
--                  tard ; aucun ecran ne l'affiche aujourd'hui.
-- ---------------------------------------------------------------------
alter table public.maitrise
  add column if not exists serie_rapide     smallint not null default 0,
  add column if not exists dernier_temps_ms integer;

comment on column public.maitrise.serie_rapide is
  'Nombre de reponses justes du premier coup et sous seuil_reponse_rapide(), d''affilee, sur ce fait. 2 ou plus = vert. Remise a 0 des qu''une reponse est fausse, rattrapee ou lente.';

-- Les faits deja verts partent avec une serie de 2 : on fait confiance
-- au travail deja fait plutot que de le retrograder en bloc.
update public.maitrise set serie_rapide = 2 where niveau >= 3 and serie_rapide = 0;


-- ---------------------------------------------------------------------
-- 3. `enregistrer_session` — la regle est ici
--
-- ON SUPPRIME D'ABORD L'ANCIENNE SIGNATURE. Ajouter un parametre avec
-- une valeur par defaut ne remplace pas la fonction : il en cree une
-- SECONDE, et PostgreSQL refuse ensuite tout appel par noms d'arguments
-- (« function ... is not unique »). Toute l'application appelle par
-- noms — c'est ce que fait `rpc()` — donc plus rien ne marcherait.
-- Trouve en executant les tests, pas en relisant le code.
-- ---------------------------------------------------------------------
drop function if exists public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric, integer, integer,
  smallint, jsonb, uuid, integer);

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
    'nouveaux_badges', to_jsonb(v_nouveaux)
  );
end;
$$;

comment on function public.enregistrer_session(
  text, smallint[], integer, integer, jsonb, numeric, integer, integer,
  smallint, jsonb, uuid, integer, jsonb) is
  'Enregistre une partie d''eleve. LA REGLE DE MAITRISE EST ICI, plus dans l''ecran (migration 26) : le front envoie `p_faits`, un tableau de reponses brutes dans l''ordre — {fait, juste, premier, temps_ms} — et le serveur en deduit le niveau. Deux reponses justes du premier coup sous seuil_reponse_rapide() d''affilee = vert ; juste mais lent ou rattrape = orange, serie remise a zero ; faux = rouge. Un fait vert repondu lentement redescend en orange, c''est voulu. `p_maitrise` reste accepte pour un front pas encore deploye et n''affecte alors pas la serie. Refuse par ailleurs une partie a zero question (migration 25), un score superieur au nombre de questions, un score de premier essai superieur au score, une seconde session sur le meme defi, et des tables au-dela du plafond — sauf defi dont l''eleve est deja participant et dont les tables correspondent exactement (migration 21).';
