# Plan de tests manuels

## 1. Parcours élève complet (Mode B — PIN)

1. [ ] Accéder à l'application → vérifier logo + titre « Calcul Mental Saintho »
2. [ ] Se connecter avec email + PIN d'un élève démo
3. [ ] Page d'accueil → 3 cartes visibles (Apprendre, S'entraîner, Défis)

### Mode Apprendre
4. [ ] Cliquer « Apprendre » → sélecteur de tables 1-15
5. [ ] Sélectionner table 7, vérifier liste 7×1 à 7×10
6. [ ] Activer « Cacher » → les résultats deviennent « ? »
7. [ ] Taper sur une ligne → elle se révèle
8. [ ] Comptage par sauts : vérifier les multiples surlignés
9. [ ] Visualisations : basculer Groupes/Tableau/Barre
10. [ ] Toggle commutativité : 7×3 ↔ 3×7 et la visualisation pivote
11. [ ] Vérifier l'astuce ×7

### Mode S'entraîner
12. [ ] Cliquer « S'entraîner » → sélectionner tables 3, 4, 5
13. [ ] Choisir 20 questions, lancer
14. [ ] Vérifier compteur « 1/20 » qui s'incrémente
15. [ ] Répondre correctement → animation pop + mot d'encouragement
16. [ ] Répondre faux → animation shake + correction affichée
17. [ ] Série sans faute 🔥 visible + remet à zéro sur erreur
18. [ ] Cliquer « Indice » → indice stratégique sans la réponse
19. [ ] Terminer → écran de résultats (étoiles, stats, erreurs)
20. [ ] Cliquer « Réviser mes erreurs » → relance ciblée
21. [ ] Grille de maîtrise 🗺 → couleurs correctes

### Mode Chrono
22. [ ] Choisir chrono 2 min → anneau de temps visible
23. [ ] Vérifier que les transitions sont rapides (~250ms)
24. [ ] Fin du chrono → résultats avec moyenne s/question

### Validation automatique
25. [ ] Activer validation auto → la réponse se valide quand le bon nombre de chiffres est saisi
26. [ ] Désactiver → le bouton ✓ est nécessaire

## 2. Défi à 2 appareils (Phase 5 — futur)

27. [ ] Élève A crée un défi Sprint → obtient un code à 5 lettres
28. [ ] Élève B rejoint avec le code
29. [ ] Les deux répondent aux mêmes questions
30. [ ] Résultats : podium avec classement

## 3. Parcours enseignant (Phase 7 — futur)

31. [ ] Se connecter en tant que prof/admin
32. [ ] Roster : ajouter un élève, changer sa classe
33. [ ] PIN : générer les PIN en masse pour une classe
34. [ ] Tables autorisées : limiter à 1-10 pour une classe
35. [ ] Suivi : voir la heatmap de maîtrise de la classe

## 4. Test de bascule AUTH_MODE

36. [ ] Changer `AUTH_MODE` à `google` dans Config du Sheet
37. [ ] Vérifier que l'écran de login affiche le bouton Google
38. [ ] Changer à `pin` → retour au login email + PIN
