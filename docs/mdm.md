# Configuration Jamf School — MDM

## Domaines à whitelister

### Mode B (PIN uniquement) — Configuration minimale
Un seul domaine à autoriser dans la navigation :

```
calcul-mental-saintho.vercel.app
```

(Remplacer par le domaine réel du déploiement Vercel.)

### Mode A (Sign in with Google) — Domaines supplémentaires
En plus du domaine Vercel :

```
accounts.google.com
apis.google.com
www.googleapis.com
```

> ⚠️ Si ces domaines Google sont déjà bloqués par le MDM et ne peuvent pas être ouverts, utiliser le **Mode B (PIN)** qui ne nécessite aucun domaine Google.

## Procédure de test sur iPad pilote

1. Ajouter le domaine Vercel à la whitelist Jamf
2. Ouvrir Safari sur l'iPad
3. Naviguer vers `https://calcul-mental-saintho.vercel.app`
4. Vérifier que la page se charge correctement (logo, 3 cartes)
5. Tester le mode S'entraîner (saisie sur pavé numérique)
6. En Mode A : tester « Se connecter avec Google »
7. En Mode B : tester login email + PIN
