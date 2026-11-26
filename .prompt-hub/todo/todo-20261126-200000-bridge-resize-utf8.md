# Todo — Terminal encore cassé après 0.2.22

## Objectif
Le terminal d'une session reste illisible (lignes chevauchées) après 0.2.22. Trouver la vraie cause.

## Étapes
- [x] vérifier la version installée (0.2.22) et la taille mémorisée (62×54) dans le coffre
- [x] constater que le mode pont Python ignore les `resize` (pty-proxy.js) ; repérer le décodage UTF-8 par morceau
- [x] canal de resize fd 3 proxy -> pont Python (`TIOCSWINSZ`)
- [x] octets bruts dans le proxy en mode pipe ; `StringDecoder` par flux dans `makeProxyAdapter`
- [x] test bout en bout ancien/nouveau code ; lint, tests, tsc, build
- [x] bump 0.2.23, releases, memory, lessons

## Review (2026-11-26)
Ancien code : resize sans effet (`stty size` inchangé), 6 U+FFFD sur 6000 motifs. Nouveau : resize appliqué avec SIGWINCH, 0 U+FFFD.
Statut : completed (hors commit/push/release, en attente du feu vert). Non vérifié dans Obsidian.
