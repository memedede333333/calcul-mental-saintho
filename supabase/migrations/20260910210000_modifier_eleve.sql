-- =====================================================================
-- MIGRATION 35 — corriger la fiche d'un eleve en cours d'annee
--
-- Deux choses, et la seconde n'etait pas demandee : elle a ete trouvee
-- en preparant la premiere.
--
-- ---------------------------------------------------------------------
-- 1. CHANGER L'ADRESSE D'UN ELEVE DEJA CONNECTE
--
-- `modifier_eleve` refusait : « cet eleve s'est deja connecte, desactive
-- cette fiche et cree-en une nouvelle ». C'etait excessif. Quand une
-- adresse change dans Google Workspace (une coquille dans le nom, un
-- nom qui change), l'administrateur la corrige des deux cotes et cela
-- doit etre transparent pour l'eleve.
--
-- POURQUOI C'EST SANS DANGER. Un eleve connecte n'est PAS reconnu par
-- son adresse : `eleve_courant()` cherche `user_id = auth.uid()`. Toutes
-- les tables (sessions_jeu, maitrise, badges, defis_participants)
-- pointent sur `eleves.id`. L'adresse n'est qu'une etiquette, utilisee
-- une seule fois — au tout premier rattachement du compte Google.
--
-- ⚠️ ET C'EST POURQUOI ON NE TOUCHE PAS A `user_id`. La tentation est
-- de « detacher puis rattacher ». Ce serait un piege : quand Google
-- Workspace RENOMME une adresse, c'est le meme compte Google, donc la
-- meme ligne dans auth.users. Aucun compte n'est cree, donc le trigger
-- `on_auth_user_created` ne se declenche jamais, donc rien ne
-- rattacherait la fiche detachee. L'eleve se connecterait avec une
-- session valide et sans fiche : plus de points, plus de grille, plus
-- rien. En laissant `user_id` en place, il n'y a meme pas de coupure.
--
-- Un seul cas demande un rattachement : la fiche n'est encore attachee
-- a personne (`user_id is null`) et un compte existe deja a la nouvelle
-- adresse. `rattacher_par_email` s'en charge, et refuse d'elle-meme un
-- compte qui appartient deja a quelqu'un.
--
-- ⚠️ L'ADRESSE RESTE RESERVEE A L'ADMINISTRATEUR.
-- Nom, prenom et classe : tout professeur. L'adresse : administrateur
-- seul. La raison n'est pas la mefiance, elle est mecanique : un
-- professeur ne peut PAS renommer une adresse dans la console Google
-- Workspace. S'il la change ici seulement, il ne corrige rien — il
-- fabrique un desaccord entre les deux cotes. Et tant qu'un eleve ne
-- s'est jamais connecte, son adresse EST sa porte d'entree : une faute
-- de frappe le laisse dehors sans que personne comprenne pourquoi.
-- Celui qui change l'adresse doit etre celui qui peut la changer des
-- deux cotes.
--
-- ---------------------------------------------------------------------
-- 2. LE DEFAUT TROUVE EN CHEMIN : UNE MODIFICATION QUI NE MODIFIE RIEN
--
-- Le declencheur `eleves_protection` (RLS, l. 111) remet en place les
-- anciennes valeurs de email/nom/prenom/classe/actif/user_id pour tout
-- appelant qui n'est pas administrateur. Il existe pour empecher un
-- ELEVE de se changer de classe ou de se promouvoir : c'est utile.
--
-- Mais `modifier_eleve` et `ajouter_eleve` autorisent, eux, TOUT
-- professeur (`peut_administrer_classe` = `est_prof`), conformement a
-- la decision « un enseignant gere toutes les classes » — le cas de
-- test 47 l'affirme noir sur blanc.
--
-- Les deux ne disaient pas la meme chose, et c'est le declencheur qui
-- gagnait. Verifie par execution sur la base locale :
--
--   prof non admin → modifier_eleve(..., p_nom => 'NOM-CHANGE')
--                  → renvoie {"ok": true}
--                  → le nom en base n'a pas bouge.
--
-- Une professeure corrige une coquille, l'application lui dit que c'est
-- fait, et rien n'a change. Personne ne s'en apercoit.
--
-- LA CORRECTION : le declencheur laisse passer un PROFESSEUR, plus
-- seulement un administrateur. Il continue de bloquer les eleves, ce
-- qui est sa seule raison d'etre. Les tests de triche (cas 42, 149 et
-- suivants) restent au vert : un eleve n'est pas un professeur.
--
-- NUMEROTATION : 20260910210000, l'heure reelle d'ecriture.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Le declencheur dit la meme chose que les fonctions
-- ---------------------------------------------------------------------
create or replace function public.eleves_champs_proteges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Rattachement automatique du compte a la premiere connexion :
  -- c'est le systeme qui ecrit, pas l'eleve.
  if coalesce(current_setting('app.rattachement_en_cours', true), 'off') = 'on' then
    return new;
  end if;

  -- MIGRATION 35 — un PROFESSEUR fait ce qu'il veut, pas seulement un
  -- administrateur. Avant, `modifier_eleve` renvoyait {"ok": true} a une
  -- professeure et ne modifiait rien. Ce declencheur existe pour empecher
  -- un ELEVE de se changer de classe ou de se promouvoir : un eleve
  -- n'est pas un professeur, il reste bloque.
  if public.est_prof() then
    return new;
  end if;

  new.email             := old.email;
  new.nom               := old.nom;
  new.prenom            := old.prenom;
  new.classe            := old.classe;
  new.tables_autorisees := old.tables_autorisees;
  new.actif             := old.actif;
  new.user_id           := old.user_id;
  return new;
end;
$$;

comment on function public.eleves_champs_proteges() is
  'Empeche un ELEVE de modifier son email, son nom, sa classe, son plafond de tables autorisees, son statut actif ou son rattachement Auth. Laisse passer les professeurs (migration 35 : avant, une modification faite par un prof non administrateur renvoyait ok et ne changeait rien) et le rattachement systeme. Seul l''avatar reste modifiable par l''eleve lui-meme.';

-- ---------------------------------------------------------------------
-- 2. modifier_eleve : l'adresse devient corrigeable
-- ---------------------------------------------------------------------
create or replace function public.modifier_eleve(
  p_eleve_id uuid,
  p_email    text default null,
  p_nom      text default null,
  p_prenom   text default null,
  p_classe   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien  public.eleves%rowtype;
  v_email   text := lower(trim(p_email));
  v_change  boolean := false;
  v_conflit public.eleves%rowtype;
  v_rattache uuid;
begin
  select * into v_ancien from public.eleves where id = p_eleve_id;
  if not found then raise exception 'Eleve introuvable'; end if;

  if not public.peut_administrer_classe(v_ancien.classe) then
    raise exception 'Tu ne peux modifier que les eleves de tes classes'
      using errcode = '42501';
  end if;

  if p_classe is not null and not public.peut_administrer_classe(p_classe) then
    raise exception 'Tu ne peux pas deplacer un eleve vers une classe qui n''est pas la tienne'
      using errcode = '42501';
  end if;

  v_change := p_email is not null and v_email <> lower(v_ancien.email);

  if v_change then
    -- Voir l'en-tete : un professeur ne peut pas renommer l'adresse dans
    -- la console Google, donc la changer ici seulement ne corrige rien.
    if not public.est_admin() then
      raise exception 'Seul un administrateur peut changer l''adresse d''un eleve. Le nom, le prenom et la classe restent modifiables.'
        using errcode = '42501';
    end if;

    if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      raise exception 'Adresse e-mail invalide : %', p_email;
    end if;

    -- `eleves.email` est unique sur TOUTE la table, fiches desactivees
    -- comprises. Sans ce controle, la collision remonterait sous forme
    -- d'erreur de contrainte, illisible pour qui la lit a l'ecran.
    select * into v_conflit from public.eleves
     where lower(email) = v_email and id <> p_eleve_id;
    if found then
      raise exception 'Cette adresse est deja celle de % % (%)',
        v_conflit.prenom, v_conflit.nom,
        case when v_conflit.actif then 'fiche active'
             else 'fiche desactivee' end;
    end if;
  end if;

  -- ⚠️ `user_id` n'apparait pas ici, et c'est deliberé : voir l'en-tete.
  update public.eleves
     set email  = coalesce(v_email, email),
         nom    = coalesce(p_nom, nom),
         prenom = coalesce(p_prenom, prenom),
         classe = coalesce(p_classe, classe),
         plafond_tables = case
           when p_classe is not null and p_classe <> v_ancien.classe
                and plafond_tables = public.plafond_par_defaut(v_ancien.classe)
           then public.plafond_par_defaut(p_classe)
           else plafond_tables end
   where id = p_eleve_id;

  -- Fiche encore attachee a personne : la nouvelle adresse a peut-etre
  -- deja un compte Google, cree avant que la fiche soit corrigee.
  if v_change and v_ancien.user_id is null then
    v_rattache := public.rattacher_par_email(v_email);
  end if;

  perform public.journaliser('modification_eleve', v_ancien.email,
    jsonb_build_object(
      'avant', jsonb_build_object(
        'email', v_ancien.email, 'nom', v_ancien.nom,
        'prenom', v_ancien.prenom, 'classe', v_ancien.classe),
      'apres', jsonb_build_object(
        'email', coalesce(v_email, v_ancien.email),
        'nom', coalesce(p_nom, v_ancien.nom),
        'prenom', coalesce(p_prenom, v_ancien.prenom),
        'classe', coalesce(p_classe, v_ancien.classe))));

  return jsonb_build_object(
    'ok', true,
    'email_change', v_change,
    -- Vrai seulement si la fiche vient d'etre reliee a un compte Google
    -- qui existait deja. Faux ne veut PAS dire « probleme » : une fiche
    -- deja attachee le reste, sans coupure.
    'rattache', v_rattache is not null);
end;
$$;

grant execute on function public.modifier_eleve(uuid, text, text, text, text) to authenticated;

comment on function public.modifier_eleve(uuid, text, text, text, text) is
  'Corrige la fiche d''un eleve : nom, prenom, classe (tout professeur) et — depuis la migration 35 — adresse e-mail (ADMINISTRATEUR SEUL), meme si l''eleve s''est deja connecte. L''adresse est reservee a l''administrateur parce qu''un professeur ne peut pas la renommer dans Google Workspace : la changer ici seulement fabriquerait un desaccord entre les deux cotes, et tant qu''un eleve ne s''est jamais connecte son adresse est sa porte d''entree. NE TOUCHE JAMAIS A `user_id` : un eleve connecte est reconnu par son compte Auth, pas par son adresse, et detacher la fiche le priverait de tout son historique sans rien pour la rattacher (un renommage Google Workspace ne cree pas de nouveau compte, donc le trigger on_auth_user_created ne se declenche pas). Refuse une adresse deja portee par une autre fiche, active ou desactivee, en la nommant. Journalise l''avant ET l''apres.';
