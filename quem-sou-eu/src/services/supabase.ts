import { createClient } from "@supabase/supabase-js";

// Credenciais carregadas pelas variáveis de ambiente.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Verifica se as credenciais foram configuradas.
if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "As credenciais do Supabase não foram configuradas."
  );
}

// Cliente que será utilizado nas consultas ao banco.
export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);