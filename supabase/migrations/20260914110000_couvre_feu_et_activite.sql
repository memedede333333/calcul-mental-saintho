-- =====================================================================
-- Calcul Mental Saintho
-- Migration 44 : couvre-feu configurable, et activité des élèves
-- =====================================================================
-- Deux chantiers qui n'en font qu'un, parce qu'ils partagent une
-- définition : ce que « la nuit » veut dire.
--
--   1. Le couvre-feu. Une table d'un seul enregistrement, modifiable par
--      un administrateur : actif ou non, heure de début, heure de fin,
--      message. Le serveur dit s'il fait nuit ; il ne refuse RIEN.
--   2. L'activité des élèves, en deux étages étanches :
--      · `activite_synthese` et `activite_classe` — tout enseignant :
--        volume, temps passé en partie, régularité.
--      · `activite_nocturne` et `activite_eleve_detail` — administrateurs
--        seuls : ce qui a été joué pendant le couvre-feu, et la frise
--        des parties une par une.
--
-- POURQUOI LE SERVEUR NE REFUSE RIEN (tranché le 14 septembre)
-- `enregistrer_session` est derrière la file d'attente hors-ligne du
-- lot 26, et `viderFile()` jette toute réponse qui n'est pas une panne
-- réseau. Un élève qui joue à 21h25 sur un wifi faible verrait sa partie
-- partir dans la file, la file se vider à 21h35, le serveur refuser, et
-- son résultat disparaître sans un mot. Le couvre-feu jugerait l'heure
-- de l'ÉCRITURE quand ce qui compte est l'heure du JEU.
-- C'est donc une mesure de soin, tenue par l'écran : les boutons se
-- ferment, le message s'affiche, et aucune partie légitime n'est perdue.
-- Le vrai levier de contrainte est ailleurs — Temps d'écran dans Jamf
-- éteint l'iPad entier, pas une application.
--
-- UNE SEULE DÉFINITION DE LA NUIT
-- `activite_nocturne` compte les parties jouées pendant le couvre-feu
-- en relisant les heures CONFIGURÉES, jamais une constante. Si un
-- administrateur décale le couvre-feu, le tableau de bord suit. Deux
-- définitions de « la nuit » auraient divergé au premier réglage.
--
-- LE MESSAGE NE CONTIENT PAS L'HEURE
-- C'est le premier champ de texte libre du projet. La règle « aucun
-- champ de texte libre » vise le texte écrit par des collégiens et lu
-- par d'autres, qu'il faudrait modérer ; un message écrit par un
-- administrateur ne relève pas de cette raison. Il est borné à 200
-- caractères. Et il ne porte PAS l'heure de reprise : l'écran la
-- compose à partir de `heure_fin`, sinon le message mentirait dès le
-- premier réglage — un compteur juste que personne ne sait lire ne vaut
-- pas mieux qu'un compteur faux.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA TABLE DE CONFIGURATION — un seul enregistrement, pour toujours
-- ---------------------------------------------------------------------
create table if not exists public.couvre_feu (
  -- `unique_ligne` vaut toujours true : la contrainte de clé primaire
  -- interdit physiquement une seconde ligne de configuration.
  unique_ligne boolean primary key default true check (unique_ligne),
  actif        boolean     not null default true,
  heure_debut  time        not null default '21:30',
  heure_fin    time        not null default '07:30',
  message      text        not null default 'C''est l''heure de dormir. L''entraînement est en pause pour la nuit.',
  modifie_le   timestamptz not null default now(),
  modifie_par  text,
  constraint couvre_feu_bornes_distinctes check (heure_debut <> heure_fin),
  constraint couvre_feu_message_borne      check (length(trim(message)) between 1 and 200)
);

insert into public.couvre_feu (unique_ligne) values (true)
on conflict (unique_ligne) do nothing;

comment on table public.couvre_feu is
  'La configuration du couvre-feu, en un seul enregistrement. Lue par tous via `couvre_feu()`, modifiee par un administrateur via `modifier_couvre_feu()`. Aucun ecran ne lit cette table directement.';

alter table public.couvre_feu enable row level security;
-- Aucune politique : la table n'est atteignable que par les fonctions
-- `security definer` ci-dessous, qui appartiennent au proprietaire.
-- C'est la regle du projet — le front n'ecrit jamais dans les tables.


-- ---------------------------------------------------------------------
-- 2. ÉVALUER LE COUVRE-FEU À UN INSTANT DONNÉ
-- ---------------------------------------------------------------------
-- Fonction interne, volontairement sans `grant` : elle prend l'instant
-- en parametre pour que le scenario de test puisse se placer a 22h un
-- mardi sans attendre 22h. La surface publique, elle, n'a pas d'horloge
-- reglable (`couvre_feu()` plus bas).
--
-- Le creneau franchit minuit (21h30 -> 07h30) : `heure_debut` est alors
-- SUPERIEURE a `heure_fin`, et le test devient « apres le debut OU avant
-- la fin ». Un creneau qui ne franchit pas minuit se teste normalement.
-- Les deux cas sont couverts, parce qu'un administrateur peut tres bien
-- regler 13h00 -> 14h00 pour la pause meridienne.
create or replace function public.evaluer_couvre_feu(p_maintenant timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c            public.couvre_feu%rowtype;
  v_local      timestamp;      -- l'instant, lu a Paris
  v_h          time;
  v_franchit   boolean;
  v_en_cours   boolean;
  v_bascule    timestamp;      -- prochaine bascule, en heure de Paris
begin
  select * into c from public.couvre_feu;

  v_local := p_maintenant at time zone 'Europe/Paris';
  v_h     := v_local::time;

  v_franchit := c.heure_debut > c.heure_fin;

  if not c.actif then
    v_en_cours := false;
  elsif v_franchit then
    v_en_cours := (v_h >= c.heure_debut or v_h < c.heure_fin);
  else
    v_en_cours := (v_h >= c.heure_debut and v_h < c.heure_fin);
  end if;

  -- La prochaine bascule : la fin si on est dedans, le debut sinon.
  -- Calculee en heure locale puis renvoyee en timestamptz, pour que
  -- l'ecran puisse programmer le verrouillage a la seconde pres sans
  -- interroger le serveur en boucle.
  if not c.actif then
    v_bascule := null;
  elsif v_en_cours then
    v_bascule := date_trunc('day', v_local) + c.heure_fin;
    if v_bascule <= v_local then
      v_bascule := v_bascule + interval '1 day';
    end if;
  else
    v_bascule := date_trunc('day', v_local) + c.heure_debut;
    if v_bascule <= v_local then
      v_bascule := v_bascule + interval '1 day';
    end if;
  end if;

  return jsonb_build_object(
    'actif',             c.actif,
    'heure_debut',       to_char(c.heure_debut, 'HH24:MI'),
    'heure_fin',         to_char(c.heure_fin,   'HH24:MI'),
    'message',           c.message,
    'en_cours',          v_en_cours,
    'maintenant',        p_maintenant,
    'prochaine_bascule', case when v_bascule is null then null
                              else (v_bascule at time zone 'Europe/Paris') end
  );
end;
$$;

comment on function public.evaluer_couvre_feu(timestamptz) is
  'Le couvre-feu evalue a un instant donne, en heure de Paris. Interne : aucun grant, l''instant reglable ne sert qu''au scenario de test. Gere le creneau qui franchit minuit.';

revoke all on function public.evaluer_couvre_feu(timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. LA SURFACE PUBLIQUE — ce que l'application appelle
-- ---------------------------------------------------------------------
create or replace function public.couvre_feu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.evaluer_couvre_feu(now());
$$;

comment on function public.couvre_feu() is
  'L''etat du couvre-feu maintenant : `actif`, `heure_debut`, `heure_fin`, `message`, `en_cours`, `maintenant` (l''heure du SERVEUR, pour que l''ecran ne depende pas de l''horloge de l''iPad) et `prochaine_bascule`. Ouvert a tout compte connecte : un eleve doit pouvoir verrouiller son ecran. Le serveur ne refuse aucune partie — c''est une mesure de soin, pas un verrou.';

grant execute on function public.couvre_feu() to authenticated;


create or replace function public.modifier_couvre_feu(
  p_actif       boolean default null,
  p_heure_debut time    default null,
  p_heure_fin   time    default null,
  p_message     text    default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.couvre_feu%rowtype;   -- avant
  v_message text := nullif(trim(coalesce(p_message, '')), '');
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into a from public.couvre_feu;

  if v_message is not null and length(v_message) > 200 then
    raise exception 'Le message ne peut pas depasser 200 caracteres (recu : %)', length(v_message);
  end if;

  if coalesce(p_heure_debut, a.heure_debut) = coalesce(p_heure_fin, a.heure_fin) then
    raise exception 'L''heure de debut et l''heure de fin ne peuvent pas etre identiques';
  end if;

  update public.couvre_feu
     set actif       = coalesce(p_actif,       actif),
         heure_debut = coalesce(p_heure_debut, heure_debut),
         heure_fin   = coalesce(p_heure_fin,   heure_fin),
         message     = coalesce(v_message,     message),
         modifie_le  = now(),
         modifie_par = (select email from public.profs where user_id = auth.uid());

  perform public.journaliser('modification_couvre_feu', 'couvre-feu',
    jsonb_build_object(
      'avant', jsonb_build_object('actif', a.actif,
                                  'heure_debut', to_char(a.heure_debut, 'HH24:MI'),
                                  'heure_fin',   to_char(a.heure_fin,   'HH24:MI'),
                                  'message',     a.message),
      'apres', (select jsonb_build_object('actif', actif,
                                          'heure_debut', to_char(heure_debut, 'HH24:MI'),
                                          'heure_fin',   to_char(heure_fin,   'HH24:MI'),
                                          'message',     message)
                  from public.couvre_feu)
    ));

  return public.couvre_feu();
end;
$$;

comment on function public.modifier_couvre_feu(boolean, time, time, text) is
  'Regle le couvre-feu. Reserve a l''administrateur, trace au journal d''audit avec l''avant et l''apres. Chaque parametre laisse a null conserve sa valeur. Renvoie l''etat resultant, tel que `couvre_feu()` le renverrait.';

grant execute on function public.modifier_couvre_feu(boolean, time, time, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. ACTIVITÉ — L'ÉTAGE ENSEIGNANT
-- ---------------------------------------------------------------------
-- Volume, temps passe en partie, regularite. Rien sur les horaires.
--
-- « temps passe en partie » et pas « temps d'utilisation » : c'est la
-- somme des `duree_s` des parties enregistrees. Les menus n'y sont pas,
-- et le mode Apprendre non plus — il n'enregistre aucune session, par
-- construction. Un compteur porte le mot qui le rend lisible.
create or replace function public.activite_synthese(
  p_classe text default null,
  p_jours  int  default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis timestamptz;
  v_res    jsonb;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  p_jours  := least(greatest(coalesce(p_jours, 7), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  -- UNE SEULE POPULATION pour tous les compteurs : les eleves ACTIFS de
  -- la portee. Sans le `where e.actif` ci-dessous, `nb_parties` aurait
  -- compte les parties d'eleves desactives que `inscrits` ne comptait
  -- pas — deux populations de part et d'autre du meme tableau de bord.
  select jsonb_build_object(
           'jours',                     p_jours,
           'depuis',                    v_depuis,
           'inscrits',                  count(*),
           'ont_joue',                  count(*) filter (where s.n > 0),
           'nb_parties',                coalesce(sum(s.n), 0),
           'temps_partie_s',            coalesce(sum(s.duree), 0)::int,
           'temps_moyen_par_joueur_s',
             case when count(*) filter (where s.n > 0) = 0 then null
                  else (coalesce(sum(s.duree), 0)
                        / count(*) filter (where s.n > 0))::int end
         )
    into v_res
    from public.eleves e
    left join lateral (
      select count(*) as n, sum(sj.duree_s) as duree
        from public.sessions_jeu sj
       where sj.eleve_id = e.id and sj.cree_le >= v_depuis
    ) s on true
   where e.actif
     and (p_classe is null or e.classe = p_classe);

  return v_res;
end;
$$;

comment on function public.activite_synthese(text, int) is
  'Les compteurs de tete de l''ecran d''activite, sur une periode glissante. DEUX POPULATIONS NOMMEES : `inscrits` = eleves actifs de la portee, `ont_joue` = ceux d''entre eux ayant au moins une partie sur la periode. `temps_partie_s` est la somme des durees de parties — ni les menus, ni le mode Apprendre, qui n''enregistre rien. `temps_moyen_par_joueur_s` a pour denominateur `ont_joue`, comme son nom le dit, et vaut null si personne n''a joue. Reserve aux enseignants.';

grant execute on function public.activite_synthese(text, int) to authenticated;


create or replace function public.activite_classe(
  p_classe text default null,
  p_jours  int  default 7
)
returns table (
  eleve_id          uuid,
  prenom            text,
  nom               text,
  classe            text,
  nb_parties        integer,
  temps_partie_s    integer,
  jours_actifs      integer,
  derniere_activite timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis timestamptz;
begin
  if not public.est_prof() then
    raise exception 'Reserve aux enseignants' using errcode = '42501';
  end if;
  p_jours  := least(greatest(coalesce(p_jours, 7), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  return query
    select e.id, e.prenom, e.nom, e.classe,
           coalesce(s.n, 0)::integer,
           coalesce(s.duree, 0)::integer,
           coalesce(s.jours, 0)::integer,
           s.derniere
      from public.eleves e
      left join lateral (
        -- `sj.` partout : `eleve_id` est AUSSI une colonne de sortie de
        -- cette fonction, donc une variable PL/pgSQL. Sans le prefixe,
        -- PostgreSQL repond « column reference is ambiguous » et l'ecran
        -- tombe au premier appel.
        select count(*) as n,
               sum(sj.duree_s) as duree,
               count(distinct (sj.cree_le at time zone 'Europe/Paris')::date) as jours,
               max(sj.cree_le) as derniere
          from public.sessions_jeu sj
         where sj.eleve_id = e.id and sj.cree_le >= v_depuis
      ) s on true
     where e.actif
       and (p_classe is null or e.classe = p_classe)
     order by coalesce(s.n, 0) desc, e.nom, e.prenom;
end;
$$;

comment on function public.activite_classe(text, int) is
  'Une ligne par eleve ACTIF de la portee — y compris ceux qui n''ont rien joue, a zero : c''est precisement eux que le professeur cherche. `jours_actifs` compte les jours calendaires distincts a Paris. `derniere_activite` est la derniere partie enregistree ; `liste_eleves` l''expose deja a tout enseignant. Aucun horaire de couvre-feu ici : voir `activite_nocturne`, reservee a l''administrateur. Reserve aux enseignants.';

grant execute on function public.activite_classe(text, int) to authenticated;


-- ---------------------------------------------------------------------
-- 5. ACTIVITÉ — L'ÉTAGE ADMINISTRATEUR
-- ---------------------------------------------------------------------
-- « Lea a joue a 22h41 » ne dit rien des tables de multiplication : ca
-- dit qu'une enfant etait eveillee a 22h41. C'est une information sur sa
-- vie de famille, pas sur son travail. La decision « un enseignant voit
-- toutes les classes » du §3 a ete prise pour la maitrise, et sa raison
-- — les affectations changent en cours d'annee — ne dit rien des heures
-- de coucher. Ces deux fonctions sont donc reservees aux administrateurs.
create or replace function public.activite_nocturne(
  p_classe text default null,
  p_jours  int  default 7
)
returns table (
  eleve_id                uuid,
  prenom                  text,
  nom                     text,
  classe                  text,
  parties_couvre_feu      integer,
  derniere_partie_nocturne timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis  timestamptz;
  v_debut   time;
  v_fin     time;
  v_franchit boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;
  p_jours  := least(greatest(coalesce(p_jours, 7), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  -- LA definition de la nuit : celle du couvre-feu configure, relue ici.
  -- Jamais une constante — sinon un reglage ferait diverger l'ecran de
  -- la regle qu'il est cense illustrer.
  select heure_debut, heure_fin into v_debut, v_fin from public.couvre_feu;
  v_franchit := v_debut > v_fin;

  return query
    select e.id, e.prenom, e.nom, e.classe,
           coalesce(s.n, 0)::integer,
           s.derniere
      from public.eleves e
      left join lateral (
        select count(*) as n, max(cree_le) as derniere
          from public.sessions_jeu sj
         where sj.eleve_id = e.id
           and sj.cree_le >= v_depuis
           and case when v_franchit
                    then (sj.cree_le at time zone 'Europe/Paris')::time >= v_debut
                      or (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
                    else (sj.cree_le at time zone 'Europe/Paris')::time >= v_debut
                     and (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
               end
      ) s on true
     where e.actif
       and (p_classe is null or e.classe = p_classe)
       and coalesce(s.n, 0) > 0
     order by coalesce(s.n, 0) desc, e.nom, e.prenom;
end;
$$;

comment on function public.activite_nocturne(text, int) is
  'Les eleves ayant joue PENDANT LE COUVRE-FEU sur la periode, et eux seuls — une liste vide est la bonne nouvelle. La nuit est celle des heures CONFIGUREES, relues a chaque appel : si un administrateur decale le couvre-feu, ce tableau suit. Reserve a l''administrateur : une heure de connexion nominative est une information sur la vie de famille, pas sur le travail scolaire.';

grant execute on function public.activite_nocturne(text, int) to authenticated;


create or replace function public.activite_eleve_detail(
  p_eleve_id uuid,
  p_jours    int default 7
)
returns table (
  joue_le            timestamptz,
  mode               text,
  score              integer,
  nb_questions       integer,
  tables             smallint[],
  duree_s            numeric,
  points             integer,
  pendant_couvre_feu boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_depuis   timestamptz;
  v_debut    time;
  v_fin      time;
  v_franchit boolean;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;
  p_jours  := least(greatest(coalesce(p_jours, 7), 1), 365);
  v_depuis := now() - make_interval(days => p_jours);

  select heure_debut, heure_fin into v_debut, v_fin from public.couvre_feu;
  v_franchit := v_debut > v_fin;

  return query
    select sj.cree_le, sj.mode, sj.score, sj.nb_questions, sj.tables,
           sj.duree_s, sj.points,
           case when v_franchit
                then (sj.cree_le at time zone 'Europe/Paris')::time >= v_debut
                  or (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
                else (sj.cree_le at time zone 'Europe/Paris')::time >= v_debut
                 and (sj.cree_le at time zone 'Europe/Paris')::time <  v_fin
           end
      from public.sessions_jeu sj
     where sj.eleve_id = p_eleve_id
       and sj.cree_le >= v_depuis
     order by sj.cree_le desc;
end;
$$;

comment on function public.activite_eleve_detail(uuid, int) is
  'La frise des parties d''un eleve sur la periode, la plus recente d''abord, avec le drapeau `pendant_couvre_feu` calcule au serveur sur les heures configurees. Reserve a l''administrateur, pour la meme raison qu''`activite_nocturne`.';

grant execute on function public.activite_eleve_detail(uuid, int) to authenticated;
