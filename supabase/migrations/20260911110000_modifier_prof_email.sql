-- =====================================================================
-- MIGRATION 40 — Permettre a l'administrateur de modifier l'e-mail d'un prof
--
-- POURQUOI. L'administrateur pouvait modifier le role et les classes d'un
-- enseignant, mais pas son adresse e-mail. En cas de coquille a la creation
-- (ou de changement d'adresse dans Google Workspace), l'administrateur etait
-- bloque et devait intervenir manuellement en base.
--
-- LES REGLES DE SECURITE :
-- 1. Seul un administrateur (est_admin()) peut changer l'e-mail d'un prof.
-- 2. Format valide d'e-mail requis.
-- 3. Collision verifiee contre les autres profs ET contre les eleves.
-- 4. Si le prof s'est DEJA connecte (user_id is not null), on ne touche
--    pas a son user_id : la reconnaissance se fait par user_id = auth.uid().
--    Un renommage d'adresse dans Google Workspace conserve le meme auth.uid(),
--    il n'y a donc aucune coupure de session ni de droits.
-- 5. Si le prof ne s'est pas encore connecte (user_id is null), on tente
--    un rattachement immediat via rattacher_par_email() au cas ou le
--    compte Google existerait deja.
-- 6. Journalisation dans le journal d'audit.
-- =====================================================================

create or replace function public.modifier_prof(
  p_prof_id uuid,
  p_nom     text   default null,
  p_role    text   default null,
  p_classes text[] default null,
  p_email   text   default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       public.profs%rowtype;
  v_email   text := lower(trim(p_email));
  v_change  boolean := false;
  v_conflit public.profs%rowtype;
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  select * into v_p from public.profs where id = p_prof_id;
  if not found then raise exception 'Compte enseignant introuvable'; end if;

  if p_role is not null and p_role not in ('prof', 'admin') then
    raise exception 'Role inconnu : %', p_role;
  end if;

  if p_role = 'prof' and v_p.role = 'admin' and v_p.actif
     and public.nb_admins_actifs() <= 1 then
    raise exception 'Impossible : c''est le dernier administrateur actif. Nomme d''abord un autre administrateur.';
  end if;

  v_change := p_email is not null and v_email <> '' and v_email <> lower(v_p.email);

  if v_change then
    if v_email !~ '^[^@ ]+@[^@ ]+\.[^@ ]+$' then
      raise exception 'Adresse e-mail invalide : %', p_email;
    end if;

    select * into v_conflit from public.profs
     where lower(email) = v_email and id <> p_prof_id;
    if found then
      raise exception 'Cette adresse est deja utilisee par un autre enseignant (% %)',
        v_conflit.nom, case when v_conflit.actif then 'actif' else 'desactive' end;
    end if;

    if exists (select 1 from public.eleves where lower(email) = v_email) then
      raise exception 'Cette adresse est deja utilisee par un eleve';
    end if;
  end if;

  -- user_id est conserve tel quel : comme pour les eleves (migration 35),
  -- prof_courant() cherche user_id = auth.uid(), l'adresse n'est qu'une etiquette.
  update public.profs
     set nom     = coalesce(p_nom, nom),
         role    = coalesce(p_role, role),
         classes = coalesce(p_classes, classes),
         email   = case when v_change then v_email else email end
   where id = p_prof_id;

  if v_change and v_p.user_id is null then
    perform public.rattacher_par_email(v_email);
  end if;

  perform public.journaliser('modification_prof', case when v_change then v_email else v_p.email end,
    jsonb_build_object(
      'avant', jsonb_build_object('nom', v_p.nom, 'role', v_p.role, 'email', v_p.email, 'classes', v_p.classes),
      'apres', jsonb_build_object('nom', coalesce(p_nom, v_p.nom), 'role', coalesce(p_role, v_p.role), 'email', case when v_change then v_email else v_p.email end, 'classes', coalesce(p_classes, v_p.classes))
    ));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.modifier_prof(uuid, text, text, text[], text) to authenticated;

comment on function public.modifier_prof(uuid, text, text, text[], text) is
  'Modifie le nom, le role, les classes et/ou l''adresse e-mail d''un enseignant (migration 40). Reserve aux administrateurs. user_id est preserve : un enseignant deja connecte ne perd pas sa session en cas de renommage Google Workspace.';
