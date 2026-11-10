# Portfolio de Nabil OULD-TERKI

Site statique compatible avec GitHub Pages. Aucun build ni serveur applicatif requis. Le fichier `.nojekyll` permet la publication directe des fichiers statiques.

## Aperçu local

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

Ouvrir <http://127.0.0.1:8765/>. La bibliothèque se trouve à `/#documents`.

## Présentation pour le recrutement

Le site présente le positionnement .NET / Angular et Flutter dès l’accueil, les projets métier en premier, trois études de cas (Jeto/Utrav, My Office, ADD Associés), les compétences reliées à ces réalisations et le préavis d’un mois.

Les études s’ouvrent depuis les cartes ou directement avec `/#case-jeto`, `/#case-my-office` et `/#case-add-associes`. Elles comprennent le besoin, la contribution, les choix de réalisation, les fonctionnalités et les liens disponibles. Leur contenu commun au site et au PDF est dans `case_studies` dans `content/profile.json`. Le générateur actualise leur HTML dans `index.html`. L’apparence est dans `assets/css/recruitment.css` et le lecteur dans `assets/js/case-studies.js`.

Les trois captures de Jeto (exploration, réservation, notifications) proviennent de sa [fiche officielle Google Play](https://play.google.com/store/apps/details?id=com.myofficeapps.utrav) et sont conservées dans `assets/img/case-studies/`. Le contexte professionnel, les dates et les contributions proviennent du CV et des informations fournies par Nabil.

## Documents

Les téléchargements sont de vrais PDF dédiés ; le site ne transforme pas sa page en CV.

- CV : deux pages A4, avec titre .NET / Angular, Flutter, préavis, contributions professionnelles et réalisations avant les certificats.
- Fiche de présentation : une page A4.
- Carte de visite : deux pages au format fini de 85 × 55 mm, recto puis verso. Pour une impression professionnelle avec fond perdu, demander les spécifications à l’imprimeur.
- Portfolio illustré : six pages A4, dont trois études de cas, une sélection complémentaire et une page de certificats de formation.
- Fiche contact vCard et archive ZIP réunissant les documents.

Le générateur lit `content/profile.json` et produit les PDF, leurs aperçus WebP, le catalogue JavaScript et l’archive dans `assets/documents/`.

Les certificats Udemy sont décrits dans `certifications` dans ce même fichier. Leurs PDF originaux sont conservés dans `assets/certificates/`. Le générateur en crée les aperçus, actualise la rubrique du site entre les marqueurs `CERTIFICATIONS:START` et `CERTIFICATIONS:END`, ajoute leurs liens au CV et au portfolio PDF, et inclut les attestations originales dans le kit ZIP. L’export Free-Work reprend leurs intitulés, dates, organismes, identifiants et liens dans la rubrique « Certifications ».

```powershell
python -m pip install -r scripts/requirements-documents.txt
python scripts/generate_documents.py
```

Les polices Arial et Consolas sont incorporées et sous-ensemblées quand elles sont disponibles sous Windows. Les polices PDF standards prennent le relais sur les autres systèmes.

Pour modifier les informations, mettre à jour `content/profile.json`, régénérer les documents, puis reporter les changements nécessaires dans les sections correspondantes de `index.html`. Les images d’aperçu sont rendues directement depuis les PDF pour conserver la même mise en page.

Le lecteur du site propose les pages précédentes et suivantes, le zoom, l’ouverture du PDF, son téléchargement et son partage (ou la copie du lien). Les liens sont cliquables directement dans les aperçus : leurs zones sont extraites des annotations des PDF et mises à l’échelle avec la page. Il fonctionne aussi sur mobile sans extension PDF. Le téléchargement direct reste disponible sur chaque carte.

Dans le CV et le portfolio PDF, chaque réalisation possède un lien cliquable : son URL publique si elle est renseignée dans `content/profile.json`, sinon `#project-<id>` sur le site. Ces liens directs ouvrent automatiquement l’aperçu du projet lorsqu’il existe. Pour un projet privé sans démonstration, le lien mène à sa présentation. Les nouveaux liens d’aperçu nécessitent que cette version du site soit publiée sur GitHub Pages pour fonctionner sur l’adresse publique.

Les captures et le profil du navigateur de vérification sont dans `.local/`, ignoré par Git. Aucune publication automatique n’est déclenchée par le serveur local ou la génération des documents.

## Préparer le profil Free-Work

```powershell
python scripts/export_freework.py
```

Le fichier `exports/free-work-profil.md` suit l’ordre des rubriques du compte et contient uniquement des libellés et des blocs de texte à copier, champ par champ. Les champs à sélectionner sont également regroupés sous leur libellé. Le parcours et la présentation viennent de `content/profile.json`. Les champs propres au compte (préavis, tarifs, mobilité, formations déjà renseignées, langues et préférences) sont conservés dans `.local/free-work-settings.json`. Les dossiers `.local/` et `exports/` sont ignorés par Git pour garder ces données locales. Cette commande ne contacte pas Free-Work et ne modifie aucune donnée du compte.

Le TJM à reporter provient en priorité de `pricing.daily_rate_min_eur` dans `content/profile.json` : 500 €, soit le tarif de départ de la fourchette du portfolio (500–650 €). Le tarif actuellement relevé dans le compte ne remplace pas cette valeur cible lors de l’export.
