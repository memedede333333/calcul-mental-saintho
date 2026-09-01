Diagnostic reçu, et il innocente le code. La fiche d'Agathe est **active**, en classe 31, et **correctement rattachée** au compte Google portant exactement la même adresse. Aucune des trois causes envisagées ne tient. Il reste une seule explication : **l'iPad était connecté avec un autre compte Google que celui-là.**

Un seul compte orphelin en base, `claude49@saintho.fr`, créé le 28 août — un compte de test, sans fiche. Si Safari sur l'iPad avait cette session ouverte, l'application a fait exactement ce qu'on lui demande : refuser un compte absent des listes. Ce n'est pas un défaut.

**Le vrai défaut est ailleurs, et il nous a coûté une demi-journée : l'écran « Compte non reconnu » ne dit pas QUEL compte il refuse.** Un professeur devant 24 iPads ne peut pas deviner que Safari a gardé la session d'un collègue. Lot court, front uniquement, aucune migration.

**1. Afficher l'adresse du compte connecté sur l'écran « Compte non reconnu ».** `App.jsx`, bloc `appState === 'inconnu'` (vers la ligne 259). L'adresse est disponible côté client sans toucher au SQL : `supabase.auth.getSession()` la porte déjà — ajoute dans `api.js` une petite fonction du genre `emailSession()` qui renvoie `data?.session?.user?.email`, et affiche-la sous le message, en évidence :

> 🔒 **Compte non reconnu**
> Ce compte n'est pas reconnu. Demande à ton professeur.
> **Connecté avec : claude49@saintho.fr**
> *Ce n'est pas ton adresse ? Déconnecte-toi et reconnecte-toi avec ton compte du collège.*

Mets l'adresse dans un cadre lisible, pas en petit gris : c'est **l'information la plus utile de l'écran**, celle qui permet à un élève de comprendre tout seul et à un professeur de trancher en deux secondes.

**2. Le bouton devient « Se déconnecter et changer de compte ».** Le comportement ne change pas, seul le libellé. « Se déconnecter » ne dit pas à un élève de onze ans que c'est là qu'il doit cliquer pour réessayer avec la bonne adresse.

**3. Rien d'autre.** Ne touche pas au SQL, ne touche pas au reste de l'écran, ne rends pas ce message plus bavard.

**À voir à l'écran :** connecte-toi avec un compte Google absent des listes → l'écran doit afficher son adresse, et le bouton doit ramener proprement à l'écran de connexion.
