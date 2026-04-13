# VIE DE RÉSEAU — TechnoSmart

Application PWA de comptes rendus d'intervention PM pour les télécoms.
Base de données partagée entre tous les appareils (manager + techniciens).

## Déploiement complet en 15 minutes

### ÉTAPE 1 — Créer la base Supabase (gratuit)

1. Va sur **https://supabase.com** → Sign Up (gratuit)
2. Clique **"New Project"**
   - Nom : `vie-de-reseau`
   - Mot de passe : choisis-en un
   - Région : **West EU (Ireland)**
   - Clique **"Create new project"** (attends ~2 minutes)
3. Dans le menu gauche, clique **"SQL Editor"**
4. Clique **"New Query"**
5. Copie-colle TOUT le contenu du fichier **`supabase-setup.sql`**
6. Clique **"Run"** → Tu dois voir "Success"
7. Va dans **Settings > API** et note :
   - **Project URL** : `https://xxxxxx.supabase.co`
   - **anon public key** : `eyJhbG...` (la longue clé)

### ÉTAPE 2 — Configurer le projet

Ouvre le fichier `src/supabase.js` et remplace les valeurs :

```js
const SUPABASE_URL = 'https://xxxxxx.supabase.co'       // ← ton URL
const SUPABASE_ANON_KEY = 'eyJhbGciOi...'                // ← ta clé anon
```

### ÉTAPE 3 — Déployer sur Vercel (gratuit)

1. Crée un repo GitHub : https://github.com/new → nom : `vie-de-reseau`
2. Pousse le code :
```bash
cd vie-de-reseau
git init
git add .
git commit -m "v1.0"
git branch -M main
git remote add origin https://github.com/TON-USER/vie-de-reseau.git
git push -u origin main
```
3. Va sur **https://vercel.com** → connecte ton GitHub
4. **"Add New Project"** → sélectionne `vie-de-reseau`
5. Dans **Environment Variables**, ajoute :
   - `VITE_SUPABASE_URL` = ton URL Supabase
   - `VITE_SUPABASE_ANON_KEY` = ta clé anon
6. Clique **"Deploy"**
7. En ~1 minute : ton app est live sur `https://vie-de-reseau.vercel.app`

### ÉTAPE 4 — Installer sur les téléphones

Envoie le lien Vercel par SMS/WhatsApp aux techniciens.

**Android (Chrome)** :
- Ouvrir le lien → menu ⋮ → "Ajouter à l'écran d'accueil"

**iPhone (Safari)** :
- Ouvrir le lien → bouton partage ↑ → "Sur l'écran d'accueil"

L'app s'installe comme une vraie application avec l'icône TechnoSmart.

## Fonctionnement

### Codes d'accès par défaut
- **Manager** : `1234` (modifiable dans Équipe > Code Manager)
- **Techniciens** : à définir par le manager dans l'onglet Équipe

### Données partagées en temps réel
- Le manager importe les PM → les techniciens les voient immédiatement
- Un technicien crée un CR → le manager le voit en temps réel
- Les affectations PM/technicien sont synchronisées

### Vue Manager
- Import CSV des PM
- Affectation des techniciens aux PM
- Gestion des codes d'accès
- Consultation de TOUS les CR
- Suppression de CR

### Vue Technicien
- Voit uniquement SES PM affectés
- Crée des CR avec photos (caméra du téléphone)
- Consulte uniquement SES propres CR
- Ne peut PAS supprimer de CR

## Développement local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
