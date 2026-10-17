# Collaboration CoachSen

L'utilisateur demande une collaboration continue entre agents pour les travaux importants.

- L'agent principal coordonne l'architecture, les contrats frontend/backend, les fichiers partagés et l'intégration.
- Un agent frontend possède `frontend/` et la migration Angular, avec parité des parcours CoachSen.
- Un agent backend possède les API et services serveur ; il conserve les contrôles d'accès côté serveur et Supabase.
- Un agent qualité vérifie les parcours, les calculs FCFA, l'isolation entre coachs et les migrations SQL.
- Les agents communiquent directement leurs contrats et blocages. Ne pas modifier simultanément les mêmes fichiers sans accord.
- Préserver les changements locaux préexistants. Ne jamais publier de clés ni déplacer une clé service-role dans Angular.
- Exécuter les migrations dans une base de test avant toute application à une base distante.
- Une fonctionnalité terminée doit être accompagnée des vérifications effectuées et des limites restantes.

La répartition s'adapte au nombre d'agents disponibles ; les petites tâches sans sous-travail indépendant restent locales.
