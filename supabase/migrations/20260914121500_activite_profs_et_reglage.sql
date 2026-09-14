-- =====================================================================
-- Calcul Mental Saintho
-- Migration 45 : Activité des professeurs pour l'administrateur
-- =====================================================================

-- 1. `activite_profs()` : tableau de bord de l'équipe enseignante
-- Réservé aux administrateurs. Renvoie pour chaque professeur :
-- son état de connexion Google, le nombre de défis créés pour ses classes,
-- et les sessions jouées (tests ou salle des profs).
create or replace function public.activite_profs()
returns table (
  prof_id            uuid,
  email              text,
  nom                text,
  role               text,
  classes            text[],
  actif              boolean,
  connecte           boolean,
  derniere_connexion timestamptz,
  nb_defis           integer,
  nb_parties         integer,
  derniere_partie    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.est_admin() then
    raise exception 'Reserve a l''administrateur' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.email,
           p.nom,
           p.role,
           p.classes,
           p.actif,
           p.user_id is not null as connecte,
           u.last_sign_in_at     as derniere_connexion,
           (select count(*)::integer from public.defis d where d.cree_par_prof = p.id),
           (select count(*)::integer from public.sessions_profs sp where sp.prof_id = p.id),
           (select max(sp.cree_le) from public.sessions_profs sp where sp.prof_id = p.id)
      from public.profs p
      left join auth.users u on u.id = p.user_id
     order by p.actif desc, p.role, p.nom;
end;
$$;

comment on function public.activite_profs() is
  'Tableau de bord de l''implication des enseignants : connexion Google, nombre de défis lancés et parties jouées. Réservé aux administrateurs.';

grant execute on function public.activite_profs() to authenticated;
