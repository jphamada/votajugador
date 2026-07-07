-- ==========================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS (SUPABASE)
-- Copia y pega esto en el editor SQL de Supabase
-- ==========================================

-- Habilitar extensión para UUIDs (suele estar activa por defecto)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA DE PARTIDOS
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  summary TEXT,
  hero_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. TABLA DE JUGADORES
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  number INTEGER NOT NULL,
  position TEXT NOT NULL,
  image_url TEXT NOT NULL,
  initial_avg NUMERIC(3, 1) DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TABLA DE VOTOS DE USUARIOS
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  player_id UUID REFERENCES players(id) ON DELETE CASCADE NOT NULL,
  user_uuid UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- Evitar que un mismo usuario vote más de una vez al mismo jugador
  UNIQUE (player_id, user_uuid)
);

-- 4. VISTA PARA CALCULAR PROMEDIOS Y VOTANTES
-- Agrupa todos los votos de cada jugador y calcula la media matemática
CREATE OR REPLACE VIEW player_stats AS
SELECT 
  p.id AS player_id,
  p.match_id,
  -- Si no hay votos de la comunidad, muestra el promedio inicial
  ROUND(
    COALESCE(AVG(v.rating)::numeric, p.initial_avg), 1
  )::float AS average_rating,
  COUNT(v.rating) AS total_votes
FROM players p
LEFT JOIN votes v ON p.id = v.player_id
GROUP BY p.id, p.match_id, p.initial_avg;


-- ==========================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ==========================================
-- Habilitar RLS en las tablas
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

-- Políticas para Matches (Público puede leer e insertar para el demo)
CREATE POLICY "Permitir lectura pública de partidos" ON matches FOR SELECT USING (true);
CREATE POLICY "Permitir creación pública de partidos" ON matches FOR INSERT WITH CHECK (true);

-- Políticas para Players (Público puede leer e insertar para el demo)
CREATE POLICY "Permitir lectura pública de jugadores" ON players FOR SELECT USING (true);
CREATE POLICY "Permitir creación pública de jugadores" ON players FOR INSERT WITH CHECK (true);

-- Políticas para Votes (Público puede leer e insertar votos)
CREATE POLICY "Permitir lectura pública de votos" ON votes FOR SELECT USING (true);
CREATE POLICY "Permitir inserción pública de votos" ON votes FOR INSERT WITH CHECK (true);
