-- Migration: Kategori Öneri ve Açıklama Yönetimi
-- Created: 2025-01-21

-- Categories tablosunu oluştur (eğer yoksa)
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_desc TEXT,         -- 1-2 cümle
  examples TEXT[],         -- örnek alt sistem/malzeme
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Mevcut categories tablosuna açıklama alanları ekle (eğer yoksa)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categories' AND column_name = 'short_desc'
  ) THEN
    ALTER TABLE categories
      ADD COLUMN short_desc TEXT,         -- 1-2 cümle
      ADD COLUMN examples TEXT[];         -- örnek alt sistem/malzeme
  END IF;
END $$;

-- Kural tabanı: kategori anahtar kelimeleri
CREATE TABLE IF NOT EXISTS category_keywords (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  weight NUMERIC DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(category_id, keyword)
);

CREATE INDEX IF NOT EXISTS idx_category_keywords_category ON category_keywords(category_id);
CREATE INDEX IF NOT EXISTS idx_category_keywords_keyword ON category_keywords(keyword);

-- Kullanıcı geri bildirimi (öğrenme)
CREATE TABLE IF NOT EXISTS category_feedback (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT,
  suggested_category_id INT REFERENCES categories(id),
  chosen_category_id INT REFERENCES categories(id),
  query TEXT NOT NULL,
  user_id TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_feedback_query ON category_feedback(query);
CREATE INDEX IF NOT EXISTS idx_category_feedback_suggested ON category_feedback(suggested_category_id);
CREATE INDEX IF NOT EXISTS idx_category_feedback_chosen ON category_feedback(chosen_category_id);

