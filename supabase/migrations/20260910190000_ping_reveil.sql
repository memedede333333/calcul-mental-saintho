-- =====================================================================
-- MIGRATION 34 — `ping()` : de quoi reveiller la base tous les matins
--
-- LE PROBLEME. Sur l'offre gratuite, Supabase suspend un projet reste
-- inactif sept jours, et **ne le rallume pas tout seul** : il faut un
-- clic dans le tableau de bord. Une semaine de vacances suffit. Le
-- lundi de la rentree, 350 eleves trouvent une application morte et
-- personne ne sait pourquoi.
--
-- LE REMEDE. Un appel par jour, depuis GitHub Actions
-- (`.github/workflows/reveil-supabase.yml`), sur une fonction qui ne
-- fait rien d'autre que prouver que la base repond.
--
-- POURQUOI UNE FONCTION ET PAS UNE SIMPLE REQUETE HTTP. Un appel sur
-- `/rest/v1/` peut etre servi par le cache de schema de PostgREST sans
-- que PostgreSQL soit sollicite. Un appel RPC, lui, se traduit
-- forcement par une requete executee par la base. C'est la seule forme
-- dont je puisse affirmer qu'elle produit reellement de l'activite.
--
-- POURQUOI ELLE LIT UNE TABLE. `select 1` peut etre resolu par le
-- planificateur sans toucher au stockage. On compte les eleves — et on
-- **jette le compte** : la fonction renvoie toujours le meme mot.
--
-- CE QU'ELLE DIVULGUE : rien. Elle renvoie le texte « ok », quoi qu'il
-- arrive. C'est la premiere et la seule fonction ouverte a `anon`,
-- c'est-a-dire au visiteur non connecte ; elle a ete ecrite pour
-- pouvoir l'etre sans risque.
--
-- ⚠️ LA CLE. Le reveil s'appelle avec la cle **anon**, celle qui est
-- deja publique puisqu'elle est embarquee dans l'application. JAMAIS
-- la cle `service_role`, qui ouvre toute la base sans RLS.
--
-- NUMEROTATION : 20260910190000, l'heure reelle d'ecriture.
-- =====================================================================

create or replace function public.ping()
returns text
language sql
security definer
set search_path = public
as $$
  -- Le compte est calcule puis jete : ce qui compte est que la requete
  -- ait vraiment atteint une table, pas ce qu'elle y a trouve.
  select case when (select count(*) from public.eleves) >= 0
              then 'ok' end::text;
$$;

grant execute on function public.ping() to anon, authenticated;

comment on function public.ping() is
  'Reveil quotidien de la base (migration 34). Renvoie toujours « ok » et ne divulgue rien : le compte d''eleves qu''elle calcule est jete, il ne sert qu''a garantir que la requete atteint une table. Seule fonction ouverte a `anon` ; appelee une fois par jour par .github/workflows/reveil-supabase.yml avec la cle anon — JAMAIS la cle service_role. Sur l''offre gratuite, un projet inactif sept jours est suspendu et ne redemarre pas tout seul.';
