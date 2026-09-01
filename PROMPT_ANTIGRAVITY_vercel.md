**Interruption — ça bloque.** Message court et hors lot, parce que rien ne peut avancer tant que ce n'est pas fait : l'application en ligne ne démarre pas, et la recette à deux comptes est en attente.

**Le problème.** `https://calcul-mental-saintho.vercel.app` affiche un écran ivoire vide. Console :

```
Error: Configuration Supabase manquante.
Crée `frontend/.env.local` avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
```

Le build est bon (`/assets/index-C5yFI6A9.js` est bien un bundle Vite construit, hashé). Ce qui manque, ce sont les deux variables d'environnement côté Vercel : `.env.local` est dans le `.gitignore` — à juste titre — donc Vercel ne l'a jamais eu et construit sans savoir où est la base.

**Ce qu'il faut faire.**

1. Lis les deux valeurs dans `frontend/.env.local` (sur cette machine) : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
2. Déclare-les dans le projet Vercel — il est déjà lié, `.vercel/project.json` est présent — pour les trois environnements : **production, preview, development**.
3. **Redéploie.** Vite inscrit ces valeurs dans le fichier construit *au moment du build* : ajouter les variables ne change rien tant qu'il n'y a pas une nouvelle construction.
4. Ouvre l'adresse et confirme-moi que l'écran de connexion Google s'affiche, console vide.

**Trois garde-fous, ils comptent :**

- **La clé `anon`, jamais la `service_role`.** L'anon est publique par nature, elle part dans le bundle que chaque navigateur télécharge, et c'est le RLS qui protège les données. La `service_role` contourne tout le RLS : dans un bundle client, elle donnerait à n'importe quel élève de 4e un accès complet en écriture à la base de 350 élèves.
- **Ne commite pas `.env.local`**, et ne recopie les valeurs dans aucun fichier du dépôt.
- Si le jeton du CLI Vercel a expiré et qu'une authentification interactive est nécessaire, **ne tente pas de te connecter** : dis-le simplement, Aymeri le fera lui-même dans l'interface web.

**Rends-moi :** ce que tu as déclaré (les noms des variables et les environnements, pas les valeurs), l'URL du déploiement, et le résultat du point 4.
