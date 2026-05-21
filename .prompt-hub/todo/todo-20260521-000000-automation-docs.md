# Todo — "Create example automation" génère aussi AUTOMATION-DOCS.md

## Objectif
Le bouton "Create example automation" doit créer DEUX fichiers dans le dossier d'automations :
1. le fichier d'exemple `hello-world.md` (déjà existant),
2. un nouveau `AUTOMATION-DOCS.md` documentant en détail toutes les options.

## Étapes
- [ ] Ajouter une constante `AUTOMATION_DOCS_CONTENT` (markdown détaillé : chaque option, rôle, valeurs possibles, règles de schedule, exemples cron, corps du prompt).
- [ ] Modifier `createExampleAutomation()` pour écrire/écraser `AUTOMATION-DOCS.md` en plus de l'exemple, et renvoyer les deux fichiers.
- [ ] Mettre à jour le handler du bouton (Notice + ouverture) et la desc du setting.
- [ ] Build + lint + tests.
- [ ] Bump version + releases + memory + commit/push.

## Notes
Options réelles (automation.ts) : name, enabled, interval, cron, runtime, appendNewline + corps=prompt.
Règles : interval/cron mutuellement exclusifs, exactement un requis, interval entier >=1, cron 5 champs, corps non vide.
AUTOMATION-DOCS.md est de la doc régénérée → écraser si présent.
