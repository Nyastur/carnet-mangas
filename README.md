# Carnet de mangas

Carnet personnel par séries : couvertures de chaque tome, progression de lecture, résumé du tome 1, planning français et nouveautés mensuelles.

Site publié sur GitHub Pages : https://nyastur.github.io/carnet-mangas/

## GitHub Pages

L’interface est `index.html`, à publier depuis la branche `main`, dossier racine. Elle utilise Firebase Firestore (`carnet-films`, collection `mangas`) pour retrouver la collection existante. Les données de la collection ne sont pas incluses dans ce dépôt.

Le service de catalogue est dans `worker/index.js`. Il est publié sur https://carnet-mangas-catalogue.xelisa44.chatgpt.site et connecté dans `catalogue-config.js`. GitHub Pages ne peut pas exécuter ce serveur. Le service contient uniquement les opérations de catalogue public (MangaDex, Jikan et MangaBase), sans accès à Firebase. CORS est limité à `https://nyastur.github.io`.

Le compteur français exclut les tomes dont la date de parution est future. Les couvertures et les dates de sorties sont actualisées à l’ouverture du carnet. Les nombres personnalisés et les tomes déjà marqués sont préservés.

## Sources

- MangaBase : https://www.mangabase.fr/planning
- MangaDex : https://api.mangadex.org
- Jikan : https://jikan.moe
- Google Books : résumé du premier tome quand il est disponible en français.

## Publication

GitHub Pages est activé depuis la branche `main`, dossier `/ (root)`. Le service de catalogue est actif. Les mises à jour de l’interface sur `main` sont publiées automatiquement.
