-- ============================================
-- VIE DE RÉSEAU — Script SQL pour Supabase
-- ============================================
-- Exécuter dans : Supabase Dashboard > SQL Editor > New Query
-- ============================================

-- 1. Table des PM (Points de Mutualisation)
CREATE TABLE IF NOT EXISTS pms (
  code TEXT PRIMARY KEY,
  dept TEXT DEFAULT '',
  adresse TEXT DEFAULT '',
  nb_iw INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des techniciens
CREATE TABLE IF NOT EXISTS techs (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  code TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des affectations PM → Technicien
CREATE TABLE IF NOT EXISTS assignments (
  pm_code TEXT PRIMARY KEY REFERENCES pms(code) ON DELETE CASCADE,
  tech_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table des comptes rendus
CREATE TABLE IF NOT EXISTS reports (
  id BIGINT PRIMARY KEY,
  pm_code TEXT REFERENCES pms(code) ON DELETE SET NULL,
  pm_adresse TEXT DEFAULT '',
  pm_dept TEXT DEFAULT '',
  date DATE NOT NULL,
  h1 TEXT DEFAULT '',
  h2 TEXT DEFAULT '',
  tech TEXT NOT NULL,
  types TEXT[] DEFAULT '{}',
  probs TEXT[] DEFAULT '{}',
  etat TEXT DEFAULT '',
  nb_cli INTEGER DEFAULT 0,
  mesures TEXT DEFAULT '',
  actions TEXT DEFAULT '',
  materiel TEXT DEFAULT '',
  obs TEXT DEFAULT '',
  suivi BOOLEAN DEFAULT FALSE,
  suivi_txt TEXT DEFAULT '',
  photos JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table de config (code manager etc.)
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insérer le code manager par défaut
INSERT INTO config (key, value) VALUES ('mgr_code', '1234')
ON CONFLICT (key) DO NOTHING;

-- 6. Activer Row Level Security (RLS) mais autoriser tout
-- (pas d'auth Supabase, on gère les codes nous-mêmes)
ALTER TABLE pms ENABLE ROW LEVEL SECURITY;
ALTER TABLE techs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Policies : accès total via anon key (l'auth est gérée dans l'app)
CREATE POLICY "Allow all on pms" ON pms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on techs" ON techs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on assignments" ON assignments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on reports" ON reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on config" ON config FOR ALL USING (true) WITH CHECK (true);

-- 7. Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_reports_tech ON reports(tech);
CREATE INDEX IF NOT EXISTS idx_reports_pm ON reports(pm_code);
CREATE INDEX IF NOT EXISTS idx_assignments_tech ON assignments(tech_name);
