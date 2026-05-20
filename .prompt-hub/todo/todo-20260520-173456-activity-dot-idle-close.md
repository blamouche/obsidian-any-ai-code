# Tâche : pastille d'onglet par activité + fermeture auto sur inactivité

Date : 2026-05-20 17:34:56
Slug : activity-dot-idle-close

## Objectif
- Pastille d'onglet à 3 états : vert = session manuelle qui travaille, violet = automatisation
  qui travaille, gris = terminé/arrêté. Basé sur un suivi d'activité continu (sortie qui coule
  vs silence prolongé de 5 s).
- Nouvelle option (désactivée par défaut) : fermer un onglet d'automatisation quand l'activité
  est terminée (inactivité), en plus de la fermeture-sur-sortie existante.

## Décisions validées
- Seuil d'inactivité fixe = 5 s.
- Option de fermeture sur inactivité OFF par défaut.
- Garder les deux réglages (sortie + inactivité).

## Plan
1. `tabDotClass` pur dans session-utils.ts + tests.
2. CliSession : activity, noteActivity/markIdle, closeOnIdleArmed, resets, dispose.
3. Vue : onActivityChange (startSession), noteActivity (onData), markIdle (onExit).
4. renderTabBar : pastille 3 états via tabDotClass.
5. Réglage autoCloseAutomationSessionsOnIdle (champ/défaut/load/UI).
6. CSS is-working/is-automation/is-idle.
7. README + prompt-hub + version 0.2.11.

## Statut
Terminé (implémentation). Test manuel Obsidian côté utilisateur.

## Review
- Suivi d'activité continu ajouté à CliSession (noteActivity/markIdle), indépendant des timers
  de readiness. onActivityChange pilote le re-render de la pastille et la fermeture sur inactivité.
- Pastille 3 états via fonction pure tabDotClass (4 tests). 74 tests au total OK.
- Fermeture sur inactivité gardée par : origin=automation, isRunning, closeOnIdleArmed (posé après
  envoi du prompt), et setting activé. closeOnIdleArmed empêche la fermeture pendant le boot ;
  pas d'armement de timer à l'envoi -> pas de fermeture si le CLI tarde à répondre.
- Seuil fixe 5s (ACTIVITY_IDLE_MS). Option OFF par défaut. Les deux réglages de fermeture conservés.
- lint/tsc/build OK. Version 0.2.11 (manifest/versions.json/package.json/version.md alignés).
- Limite : le seuil 5s reste heuristique (une pause de sortie > 5s en pleine tâche peut être vue
  comme "terminé"). Documenté dans la desc du réglage et le README.
