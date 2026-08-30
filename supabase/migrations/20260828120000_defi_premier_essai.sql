-- =====================================================================
-- Calcul Mental Saintho
-- Migration 14 : les defis comptent le premier essai, comme le reste
-- =====================================================================
--
-- CONSTAT (avant d'ecrire le lot des defis)
--
-- `terminer_defi()` appelle `enregistrer_session()` sans lui passer
-- `p_score_premier_essai`. La base le traite alors comme « tout trouve
-- du premier coup » — c'est la compatibilite prevue pour les parties
-- remontees hors ligne par l'ancien client.
--
-- Consequence : en defi, un eleve qui rattrape dix reponses touche
-- autant de points qu'un eleve qui les a toutes trouvees du premier
-- coup. C'est exactement le trou qu'on a ferme pour l'entrainement
-- libre, rouvert par une autre porte.
--
-- Le classement DU DEFI n'est pas concerne : il trie au score puis au
-- temps, et un rattrapage coute deja des secondes. Ce sont les points
-- qui alimentent le classement Progression qui etaient gonfles.
--
-- On ajoute le parametre et on le fait suivre. Il vaut null par defaut :
-- un client qui ne l'envoie pas se comporte comme avant.
-- =====================================================================

drop function if exists public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb);

create or replace function public.terminer_defi(
  p_defi_id  uuid,
  p_score    integer,
  p_temps_s  numeric,
  p_erreurs  integer default 0,
  p_detail   jsonb   default '{}',
  p_maitrise jsonb   default '{}',
  p_score_premier_essai integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_eleve uuid := public.eleve_courant();
  v_defi  public.defis%rowtype;
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

  perform public.enregistrer_session(
    p_mode           => v_defi.type,
    p_tables         => v_defi.tables,
    p_nb_questions   => p_score + p_erreurs,
    p_score          => p_score,
    p_duree_s        => p_temps_s,
    p_sans_faute_max => 0,
    p_maitrise       => p_maitrise,
    p_defi_id        => p_defi_id,
    p_score_premier_essai => p_score_premier_essai
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
  public.terminer_defi(uuid, integer, numeric, integer, jsonb, jsonb, integer)
to authenticated;
