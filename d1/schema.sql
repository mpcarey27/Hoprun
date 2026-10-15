-- ===================================================================
-- Cloudflare D1 Database Schema for ACR Running Workload Tracker
-- Designed for Cloudflare Free Tier (SQLite at the Edge, 5GB storage)
-- ===================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'runner', -- 'runner' | 'coach'
  avatar_url TEXT,
  google_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  run_order INTEGER DEFAULT 1,
  distance REAL NOT NULL,
  distance_unit TEXT DEFAULT 'mi', -- 'mi' | 'km'
  run_type TEXT NOT NULL,
  multiplier REAL NOT NULL,
  load REAL NOT NULL,
  comments TEXT,
  completed INTEGER DEFAULT 1, -- 1 = completed, 0 = planned
  plan_id TEXT,
  plan_day_index INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON workouts(user_id, workout_date);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  coach_id TEXT NOT NULL,
  coach_name TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  start_date TEXT NOT NULL,
  days_json TEXT NOT NULL, -- JSON array of 7 day items
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  coach_id TEXT,
  athlete_id TEXT,
  athlete_name TEXT NOT NULL,
  plan_id TEXT,
  type TEXT NOT NULL, -- 'completed' | 'edited'
  workout_date TEXT NOT NULL,
  run_type TEXT NOT NULL,
  distance REAL NOT NULL,
  distance_unit TEXT DEFAULT 'mi',
  comment TEXT,
  read INTEGER DEFAULT 0, -- 0 = unread, 1 = read
  timestamp INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  user_id TEXT PRIMARY KEY,
  distance_unit TEXT DEFAULT 'mi',
  first_day_of_week INTEGER DEFAULT 1, -- 1 = Monday, 0 = Sunday
  warning_threshold REAL DEFAULT 1.2,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
