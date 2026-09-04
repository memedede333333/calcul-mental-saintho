-- =====================================================================
-- MIGRATION 25 — la presence aux defis, les sessions vides, et la
--                liste des eleves hors plafond
--
-- Trois corrections sans rapport entre elles, groupees parce qu'elles
-- partent ensemble et qu'elles se testent ensemble.
--
-- 1. PRESENCE AUX DEFIS
--    `rejoindre_defi()` n'ecrit rien. Un eleve qui saisit le code et
--    commence a jouer n'existe nulle part tant qu'il n'a pas fini :
--    c'est `terminer_defi()` qui insere dans `defis_participants`.
--    Consequence : l'ecran du code projete ne peut afficher qu'un seul
--    nombre, « ont termine ». Le professeur qui projette le code veut
--    d'abord voir les eleves ARRIVER — c'est comme ca qu'il sait si la
--    classe a compris quoi taper.
--    On ajoute donc une table de presence. Elle ne remplace pas
--    `defis_participants` et ne la modifie pas : rendre `score` et
--    `temps_s` nullables pour y loger les arrivants aurait fragilise
--    `classement_defi()`, qui trie dessus.
--
--    TROIS POPULATIONS, TROIS NOMS, comptees separement :
--      `rejoints`  — ont saisi le code (defis_presences)
--      `termines`  — ont fini la partie (defis_participants)
--      `en_cours`  — ont rejoint et n'ont pas fini
--    `en_cours` est compte, pas soustrait. Une soustraction sur des
--    defis anterieurs a cette migration (presences vides, participants
--    remplis) donnerait un nombre negatif.
--
-- 2. LA SESSION A ZERO QUESTION
--    `progression_detail()` calcule `bonus_jours = 100 * jours_actifs`
--    (migration 20260828100000). Une session enregistree avec zero
--    question repondue suffit donc a marquer le jour actif : +100
--    points pour avoir ouvert l'application et quitte aussitot. Le
--    front a ete corrige (il n'appelle plus l'API quand rien n'a ete
--    repondu), mais une regle de points ne se garde pas dans un ecran.
--    On refuse en base.
--
-- 3. LES ELEVES HORS PLAFOND, NOMMES
--    `apercu_defi_classe()` renvoie « 4 eleves n'ont pas encore la
--    table de 9 » sans dire lesquels. Le professeur ne peut donc pas
--    choisir entre ouvrir la table a toute la classe et la retirer du
--    defi. La liste utilise EXACTEMENT le meme predicat que le
--    compteur : sa longueur egale toujours `eleves_hors_plafond`, par
--    construction et non par coincidence.
--
-- NUMEROTATION : 20260904090000, l'heure reelle d'ecriture.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. LA TABLE DE PRESENCE
-- ---------------------------------------------------------------------
create table if not exists public.defis_presences (
  defi_id    uuid not null references public.defis(id)  on delete cascade,
  eleve_id   uuid not null references public.eleves(id) on delete cascade,
  rejoint_le timestamptz not null default now(),
  primary key (defi_id, eleve_id)
);

comment on table public.defis_presences is
  'Qui a saisi le code d''un defi. Une ligne par eleve et par defi, posee par rejoindre_defi(). C''est une population DIFFERENTE de defis_participants, qui ne contient que ceux qui ont TERMINE. Ne jamais confondre les deux, ne jamais deduire l''une de l''autre par soustraction.';

alter table public.defis_presences enable row level security;

-- Meme regle que pour les participations : l'eleve voit la sienne, le
-- professeur voit tout. Aucun INSERT direct — rejoindre_defi() est
-- security definer et contourne ces regles.
create policy presences_lecture_soi on public.defis_presences
  for select to authenticated
  using (eleve_id = public.eleve_courant());

create policy presences_lecture_prof on public.defis_presences
  for select to authenticated
  using (public.est_prof());


-- ---------------------------------------------------------------------
-- 2. REJOINDRE — inchange, sauf qu'on note l'arrivee
--
-- L'insertion est placee APRES tous les refus : un code inconnu, un
-- defi ferme ou une seconde participation ne laissent aucune trace.
-- `on conflict do nothing` parce qu'un eleve peut tres bien saisir le
-- code, fermer l'iPad et le ressaisir : c'est la meme arrivee, pas
-- deux. `rejoint_le` garde alors la premiere heure, la vraie.
-- ---------------------------------------------------------------------
create or replace function public.rejoindre_defi(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
  v_a     record;
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

  -- L'arrivee. Nouveau dans la migration 25.
  insert into public.defis_presences (defi_id, eleve_id)
  values (v_defi.id, v_eleve)
  on conflict (defi_id, eleve_id) do nothing;

  select * into v_a from public.auteur_defi(v_defi.id);

  return jsonb_build_object(
    'ok', true,
    'defi_id',    v_defi.id,
    'type',       v_defi.type,
    'tables',     to_jsonb(v_defi.tables),
    'duree_s',    v_defi.duree_s,
    'questions',  v_defi.questions,
    'origine',    v_a.origine,
    'auteur_nom', v_a.auteur_nom,
    'classe',     v_defi.classe
  );
end;
$$;

comment on function public.rejoindre_defi(text) is
  'Ouvre un defi a partir de son code et note l''arrivee de l''eleve dans defis_presences (migration 25). Ne cree AUCUNE participation : c''est terminer_defi() qui le fait, a la fin de la partie. Un refus (code inconnu, defi ferme, deja joue) ne laisse aucune trace.';


-- ---------------------------------------------------------------------
-- 3. AVANCEMENT — trois populations nommees
--
-- `termines` et les deux compteurs de classe ne changent pas de sens.
-- On ajoute `rejoints`, `rejoints_classe` et `en_cours`.
-- ---------------------------------------------------------------------
create or replace function public.avancement_defi(p_defi_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'origine',         a.origine,
    'auteur_nom',      a.auteur_nom,
    'classe',          d.classe,

    -- Ont saisi le code. Vaut 0 pour les defis crees avant la
    -- migration 25 : la table n'existait pas, personne n'y figure.
    'rejoints',        (select count(*) from public.defis_presences pr
                         where pr.defi_id = d.id),

    -- Ont termine la partie. Sens inchange.
    'termines',        (select count(*) from public.defis_participants p
                         where p.defi_id = d.id),

    -- Ont rejoint et n'ont pas fini. COMPTE, jamais soustrait.
    'en_cours',        (select count(*) from public.defis_presences pr
                         where pr.defi_id = d.id
                           and not exists (
                             select 1 from public.defis_participants p
                              where p.defi_id = d.id
                                and p.eleve_id = pr.eleve_id)),

    -- Les trois compteurs restreints a la classe du defi. `null` quand
    -- le defi n'est pas un defi de prof rattache a une classe : il n'y
    -- a alors pas de classe de reference, et un 0 se lirait « personne ».
    'rejoints_classe', case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.defis_presences pr
                            join public.eleves e on e.id = pr.eleve_id
                           where pr.defi_id = d.id and e.classe = d.classe) end,
    'termines_classe', case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.defis_participants p
                            join public.eleves e on e.id = p.eleve_id
                           where p.defi_id = d.id and e.classe = d.classe) end,

    -- Les eleves ACTIFS de la classe. Population encore differente :
    -- elle inclut ceux qui n'ont pas ouvert l'application.
    'attendus',        case when d.cree_par_prof is null or d.classe is null
                            then null else
                         (select count(*) from public.eleves e
                           where e.actif and e.classe = d.classe) end
  )
    from public.defis d
    cross join lateral public.auteur_defi(d.id) a
   where d.id = p_defi_id;
$$;

comment on function public.avancement_defi(uuid) is
  'L''en-tete de l''ecran d''un defi. SIX compteurs, SIX populations distinctes : `rejoints` (ont saisi le code), `termines` (ont fini), `en_cours` (ont rejoint sans finir, compte et non soustrait), `rejoints_classe` et `termines_classe` (les memes restreints a la classe du defi), `attendus` (les eleves actifs de la classe, y compris ceux qui n''ont jamais ouvert l''application). Ne jamais rapprocher deux de ces nombres en pourcentage sans nommer les deux populations. `rejoints` vaut 0 pour tout defi anterieur a la migration 25.';


-- ---------------------------------------------------------------------
-- 4. UNE SESSION SANS QUESTION N'EST PAS UNE SESSION
--
-- Le refus est pose avant toute ecriture, donc avant les points, les
-- badges et la maitrise.
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
  text, smallint[], integer, integer, jsonb, numeric, integer, integer,
  smallint, jsonb, uuid, integer) is
  'Enregistre une partie d''eleve. REFUSE une partie a zero question (migration 25) : `progression_detail` accorde 100 points par jour actif, et une session vide suffisait a marquer le jour. Refuse aussi un score superieur au nombre de questions, un score de premier essai superieur au score, une seconde session sur le meme defi, et des tables au-dela du plafond — sauf si la session est rattachee a un defi dont l''eleve est deja participant et dont les tables correspondent exactement (migration 21).';


-- ---------------------------------------------------------------------
-- 5. LES ELEVES HORS PLAFOND, NOMMES
--
-- Le predicat est copie MOT POUR MOT de `apercu_defi_classe` :
--   classe = p_classe, actif, plafond_tables < max(p_tables)
-- La longueur de cette liste egale donc toujours `eleves_hors_plafond`
-- du meme appel. Si l'un des deux change un jour, l'autre doit changer
-- dans le meme commit — c'est tout l'interet de les avoir cote a cote.
--
-- Meme verrou que le compteur : `prof_voit_classe`. Attention a ce que
-- ce nom veut dire aujourd'hui : depuis la migration 20260827090000,
-- `prof_voit_classe()` se contente d'appeler `est_prof()` — TOUT
-- enseignant voit TOUTES les classes, le parametre n'est garde que pour
-- ne pas reecrire les politiques RLS. Un ELEVE, lui, obtient bien une
-- liste vide. On reprend ce verrou tel quel plutot que d'en inventer un
-- plus strict ici : deux fonctions qui repondent a la meme question ne
-- doivent pas avoir deux regles d'acces differentes. Le jour ou le
-- cloisonnement par classe reviendra, il reviendra pour les deux en
-- meme temps, en un seul endroit.
-- ---------------------------------------------------------------------
create or replace function public.eleves_hors_plafond(
  p_classe text,
  p_tables smallint[]
)
returns table (
  eleve_id       uuid,
  prenom         text,
  nom            text,
  plafond_tables smallint
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.prenom, e.nom, e.plafond_tables
    from public.eleves e
   where e.classe = p_classe
     and e.actif
     and e.plafond_tables < (select max(x) from unnest(p_tables) x)
     and public.prof_voit_classe(p_classe)
   order by e.nom, e.prenom;
$$;

grant execute on function public.eleves_hors_plafond(text, smallint[]) to authenticated;

comment on function public.eleves_hors_plafond(text, smallint[]) is
  'Les eleves ACTIFS de p_classe dont le plafond n''atteint pas la plus haute table de p_tables — nommes. Meme predicat exactement que le compteur `eleves_hors_plafond` de apercu_defi_classe() : la longueur de cette liste egale toujours ce compteur. Meme verrou que le compteur : prof_voit_classe(), qui depuis le 27/08/2026 vaut est_prof() — tout enseignant voit toutes les classes. Un eleve obtient une liste vide. `plafond_tables` est un DROIT gagne par la Montee, pas une trace de travail : ne jamais afficher ces noms avec le mot « travaille ».';


-- ---------------------------------------------------------------------
-- 6. QUI EST ARRIVE — les prenoms et les avatars du code projete
--
-- La maquette 9 n'affiche pas seulement « 18 connectes » : elle montre
-- les avatars et les prenoms de ceux qui sont arrives, pour que la
-- classe se voie se remplir. Ce sont des NOMS : ils ne se deduisent pas
-- d'un compteur, il faut une fonction qui les renvoie.
--
-- Verrou : le MEME que `classement_defi()`, c'est-a-dire aucun au-dela
-- de l'authentification. Ce n'est pas un oubli. Les deux ecrans sont
-- projetes au tableau devant la classe entiere, et il faut connaitre
-- l'identifiant du defi pour appeler l'une ou l'autre. Leur donner des
-- regles differentes rendrait l'ecran incoherent avec lui-meme : les
-- prenoms disparaitraient a la fin de la partie, au moment ou le
-- classement les affiche.
--
-- `a_termine` evite un second appel : c'est ce qui permet de griser un
-- avatar quand l'eleve a fini, sans que l'ecran ait a rapprocher deux
-- listes lui-meme.
-- ---------------------------------------------------------------------
create or replace function public.presents_defi(p_defi_id uuid)
returns table (
  eleve_id     uuid,
  prenom       text,
  avatar_emoji text,
  classe       text,
  rejoint_le   timestamptz,
  a_termine    boolean,
  est_moi      boolean
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.prenom, e.avatar_emoji, e.classe, pr.rejoint_le,
         exists (select 1 from public.defis_participants p
                  where p.defi_id = pr.defi_id and p.eleve_id = pr.eleve_id),
         e.id = public.eleve_courant()
    from public.defis_presences pr
    join public.eleves e on e.id = pr.eleve_id
   where pr.defi_id = p_defi_id
   order by pr.rejoint_le;
$$;

grant execute on function public.presents_defi(uuid) to authenticated;

comment on function public.presents_defi(uuid) is
  'Qui a saisi le code d''un defi, dans l''ordre d''arrivee, avec prenom et avatar — pour l''ecran du code projete (maquette 9). La longueur de cette liste egale toujours `rejoints` de avancement_defi() : meme table, meme predicat. `a_termine` dit si l''eleve a deja fini, pour ne pas avoir a rapprocher deux listes dans l''ecran. Meme regle d''acces que classement_defi() : tout compte authentifie qui connait l''identifiant du defi, parce que les deux ecrans sont projetes devant la meme classe.';
