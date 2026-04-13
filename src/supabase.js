import { createClient } from '@supabase/supabase-js'

// ⚠️ REMPLACE CES VALEURS avec celles de ton projet Supabase
// Dashboard > Settings > API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://gnmilbeosmkhrqjpeowc.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdubWlsYmVvc21raHJxanBlb3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMzk4MjQsImV4cCI6MjA5MTYxNTgyNH0.6eq2TrM8vKl8aafYWf2UGlBJnIVtXEx3aH8yx8dV6l4'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
