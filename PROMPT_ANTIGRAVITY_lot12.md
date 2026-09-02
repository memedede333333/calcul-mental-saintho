Un seul point, front uniquement, aucune migration.

**Le défaut, constaté sur iPad (test E5).** Un élève ferme l'application pendant un défi et la rouvre : il est toujours connecté, mais **le défi a disparu**. L'état vit en mémoire React et il n'existe aucun chemin de retour. Or `mes_defis()` ne liste que les défis qu'on a **créés**, pas ceux qu'on a rejoints : un élève qui a rejoint le défi de son professeur n'a plus que le code à cinq lettres pour y revenir. S'il ne l'a pas noté, c'est perdu.

Sa partie n'est pas perdue au sens des données — `terminer_defi` n'a jamais été appelé, il peut rejouer. Il faut juste qu'il retrouve le chemin. En classe, un iPad qui redémarre ou un élève qui bascule d'application, cela arrivera tous les jours.

**Le correctif : retenir le dernier défi rejoint, dans le navigateur.**

**1. À l'entrée dans un défi.** Quand `rejoindre_defi(code)` réussit, écris dans `localStorage` :

```js
{
  cle: `matho.defi_en_cours.${idUtilisateur}`,
  valeur: { code, defi_id, type, classe, auteur_nom, rejoint_le: Date.now() }
}
```

**La clé porte l'identifiant de l'utilisateur connecté.** Si un iPad est partagé, ou si deux élèves se succèdent, l'un ne doit pas se voir proposer le défi de l'autre. À l'ouverture, ne lis que la clé du compte courant.

**2. Sur l'accueil élève, un bandeau de reprise**, au-dessus des quatre modes :

> ⚔️ **Tu as un défi en cours**
> Défi de M. Desjardins — code UEWTR
> **[ Reprendre ]**

Discret, pas une carte de mode : c'est un rattrapage, pas une cinquième façon de jouer.

**3. Au clic, c'est le serveur qui décide.** Appelle `rejoindre_defi(code)` comme si l'élève tapait le code.

- Si ça réussit → il repart sur l'écran d'annonce du défi, puis la partie.
- Si ça échoue — défi expiré, fermé, ou déjà terminé par lui — **efface l'entrée** et affiche le message du serveur tel quel. **N'invente aucune raison côté écran** : `rejoindre_defi` renvoie déjà `raison` et `message`.

**4. Efface l'entrée** quand `terminer_defi` réussit, à la déconnexion, et si `rejoint_le` remonte à plus de **7 jours**. Sept jours n'est pas une valeur arbitraire : c'est la durée de vie maximale d'un défi (`creer_defi` : 7 jours pour un professeur, 24 h pour un élève). Au-delà, l'entrée est certainement morte — ce n'est pas une supposition sur l'état du serveur, c'est un fait connu.

**5. Ne tente rien de plus.** Pas de reprise de la partie là où elle en était : les questions déjà répondues ne sont nulle part, et faire semblant serait pire que recommencer. L'élève rejoue le défi depuis le début, ce qui est le comportement correct — sa première tentative n'a jamais été enregistrée.

**Et enveloppe chaque lecture et chaque écriture de `localStorage` dans un `try / catch`.** Sur un iPad en navigation privée, ou avec les données de site bloquées, l'accès lève une exception : l'application doit continuer sans bandeau, pas planter au démarrage.

**À voir à l'écran :** rejoindre un défi, fermer complètement l'application, la rouvrir → le bandeau est là et ramène au défi · terminer un défi → le bandeau disparaît · se déconnecter et se reconnecter avec un autre compte élève → aucun bandeau du compte précédent.
