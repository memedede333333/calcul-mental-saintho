-- =====================================================================
-- MIGRATION 39 — rendre `ping()` au visiteur anonyme
--
-- CE QUI S'EST PASSE. La migration 38 a ete completee, apres coup, par
-- deux lignes :
--
--     revoke execute on all functions in schema public from anon;
--     alter default privileges in schema public
--       revoke execute on functions from anon;
--
-- L'intention est bonne — dire explicitement ce qu'on ferme plutot que
-- de compter sur le retrait a PUBLIC. Mais ce `revoke` frappe aussi
-- `ping()`, qui avait recu son droit a la migration 34, donc AVANT.
-- Les cinq fonctions dont RLS a besoin, elles, sont re-accordees plus
-- bas dans la migration 38 et survivent ; `ping()` n'est nulle part.
--
-- Verifie par execution, cas de test 177 :
--
--     ERROR:  permission denied for function ping
--
-- CE QUE CA CASSE, ET QUAND. `ping()` n'est appelee par aucun ecran :
-- elle sert au reveil quotidien (`.github/workflows/reveil-supabase.yml`),
-- qui s'authentifie avec la cle anon. Ce reveil echoue donc depuis
-- l'application de la migration 38 — bruyamment, un courriel part a
-- chaque tentative, c'est le seul point rassurant.
--
-- Et si personne ne le voit : sur l'offre gratuite, sept jours sans
-- activite suffisent a suspendre le projet, et **Supabase ne le
-- rallume pas tout seul**. Le premier lundi de vacances, l'application
-- est morte pour 350 eleves.
--
-- LA LECON, ET ELLE VAUT POUR LA SUITE : `ping()` est la seule fonction
-- de tout le projet ouverte a `anon`. Elle ne ressemble donc a rien
-- d'autre, et tout `revoke ... from anon` ecrit « pour faire propre » la
-- touchera. Ce commentaire est ici pour que le prochain s'en souvienne.
--
-- NUMEROTATION : 20260911090000, l'heure reelle d'ecriture.
-- =====================================================================

grant execute on function public.ping() to anon, authenticated;

comment on function public.ping() is
  'Reveil quotidien de la base (migration 34). Renvoie toujours « ok » et ne divulgue rien : le compte d''eleves qu''elle calcule est jete, il ne sert qu''a garantir que la requete atteint une table. ⚠️ SEULE FONCTION DU PROJET OUVERTE A `anon` — tout `revoke execute ... from anon` ecrit pour faire propre la casse, et le reveil quotidien s''arrete (c''est arrive a la migration 38, repare par la 39). Appelee une fois par jour par .github/workflows/reveil-supabase.yml avec la cle anon — JAMAIS la cle service_role. Sur l''offre gratuite, un projet inactif sept jours est suspendu et ne redemarre pas tout seul.';
