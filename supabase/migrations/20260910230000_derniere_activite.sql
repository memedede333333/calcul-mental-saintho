-- =====================================================================
-- MIGRATION 36 — « Jamais connecte » doit dire la verite
--
-- Trouve en relisant l'ecran Administration livre ce matin. Deux
-- defauts, la meme cause : `derniere_connexion` et `deja_connecte` ne
-- veulent pas dire ce que leur nom promet.
--
-- ---------------------------------------------------------------------
-- 1. `derniere_connexion` n'est ecrite QU'UNE FOIS DANS UNE VIE
--
-- Une seule ligne de tout le projet y touche : le trigger
-- `on_auth_user_created` (schema, l. 182), au tout premier rattachement
-- du compte Google. Jamais ensuite. Ce n'est donc pas une derniere
-- connexion, c'est une PREMIERE, gravee pour toujours.
--
-- L'ecran livre ce matin affiche « Derniere connexion le … » dans une
-- infobulle. En decembre, un eleve qui joue tous les jours y lira
-- « Derniere connexion le 3 septembre ». Un chiffre faux, lu par un
-- professeur, sur un eleve nomme.
--
-- ---------------------------------------------------------------------
-- 2. `deja_connecte` REDEVIENT FAUX QUAND LE COMPTE GOOGLE DISPARAIT
--
-- `liste_eleves` le calcule par `user_id is not null`. Or `eleves.user_id`
-- est declare `on delete set null` : quand un compte Google est supprime
-- de Workspace, la colonne repasse a null toute seule.
--
-- Le scenario n'a rien d'exotique, c'est le calendrier du college : les
-- comptes des partants sont supprimes en juillet, les fiches restent
-- actives jusqu'a l'import de septembre. A la rentree, **tous les eleves
-- partis en juin s'afficheraient « Jamais connecte »**, seraient comptes
-- dans la pastille « Jamais connectes (X) », et l'administrateur irait
-- relancer des eleves qui ont quitte l'etablissement.
--
-- ---------------------------------------------------------------------
-- CE QUE FAIT CETTE MIGRATION
--
-- a) `derniere_connexion` est mise a jour A CHAQUE PARTIE ENREGISTREE,
--    par un declencheur pose sur `sessions_jeu`.
--
--    ⚠️ POURQUOI UN DECLENCHEUR ET PAS UNE LIGNE DANS CHAQUE FONCTION :
--    cinq migrations differentes contiennent un `insert into
--    sessions_jeu`. Ajouter la ligne dans chacune, c'est se preparer a
--    en oublier une — exactement la faute de la migration 26, ou
--    `p_faits` avait ete ajoute a `enregistrer_session` sans etre relaye
--    par `terminer_defi`. La table est le seul point par ou tout passe.
--
-- b) `deja_connecte` devient « s'est connecte au moins une fois » :
--    rattache aujourd'hui **OU** trace d'activite. Une trace d'activite
--    ne s'efface pas quand un compte Google est supprime.
--
-- NUMEROTATION : 20260910230000, l'heure reelle d'ecriture.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Chaque partie enregistree fait foi d'activite
-- ---------------------------------------------------------------------
create or replace function public.marquer_activite_eleve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `greatest` : une partie rejouee depuis la file hors-ligne ne doit
  -- jamais faire RECULER la date.
  update public.eleves
     set derniere_connexion = greatest(
           coalesce(derniere_connexion, new.cree_le), new.cree_le)
   where id = new.eleve_id;
  return null;
end;
$$;

drop trigger if exists sessions_jeu_activite on public.sessions_jeu;

create trigger sessions_jeu_activite
  after insert on public.sessions_jeu
  for each row execute function public.marquer_activite_eleve();

comment on column public.eleves.derniere_connexion is
  'Date de la derniere partie enregistree, ou du premier rattachement du compte Google si l''eleve n''a encore rien joue. Tenue a jour par le declencheur `sessions_jeu_activite` (migration 36) : avant lui, elle n''etait ecrite qu''UNE fois dans une vie, au premier rattachement, et un eleve jouant tous les jours affichait encore la date de septembre.';

-- ---------------------------------------------------------------------
-- 2. « Jamais connecte » ne s'efface plus avec le compte Google
-- ---------------------------------------------------------------------
create or replace function public.liste_eleves(p_classe text default null)
returns table (
  eleve_id          uuid,
  email             text,
  prenom            text,
  nom               text,
  classe            text,
  avatar_emoji      text,
  plafond_tables    smallint,
  palier            text,
  actif             boolean,
  deja_connecte     boolean,
  derniere_connexion timestamptz,
  nb_sessions       integer,
  points_semaine    integer
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.email, e.prenom, e.nom, e.classe, e.avatar_emoji,
         e.plafond_tables,
         public.palier_de_plafond(e.plafond_tables),
         e.actif,
         -- MIGRATION 36 — rattache aujourd'hui OU trace d'activite.
         -- `user_id` seul ne suffit pas : il est `on delete set null`,
         -- donc la suppression du compte Google d'un partant ferait
         -- reapparaitre sa fiche en « jamais connecte » a la rentree.
         (e.user_id is not null or e.derniere_connexion is not null),
         e.derniere_connexion,
         coalesce(s.n, 0)::integer,
         coalesce(s.pts_semaine, 0)::integer
    from public.eleves e
    left join lateral (
      select count(*) as n,
             sum(points) filter (
               where cree_le >= public.debut_periode('semaine')) as pts_semaine
        from public.sessions_jeu where eleve_id = e.id
    ) s on true
   where public.est_prof()                 -- verrou : rien pour un eleve
     and (p_classe is null or e.classe = p_classe)
   -- Les eleves desactives passent en dernier, mais restent visibles :
   -- c'est ce qui permet de les reactiver.
   order by e.actif desc, e.nom, e.prenom;
$$;

grant execute on function public.liste_eleves(text) to authenticated;

comment on function public.liste_eleves(text) is
  'Les eleves d''une classe (ou tous si p_classe est null), actifs ET desactives. C''est CETTE fonction que l''ecran Administration doit utiliser — pas eleves_sans_connexion(), qui repond a la question « qui n''a jamais ouvert l''application ? ». `deja_connecte` (migration 36) = rattache a un compte Google AUJOURD''HUI **ou** portant une trace d''activite : `user_id` seul serait faux, il repasse a null tout seul quand le compte Google est supprime de Workspace. `derniere_connexion` est la date de la derniere PARTIE, tenue a jour par le declencheur `sessions_jeu_activite`.';
