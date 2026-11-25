
import { supabase } from "./supabase";

// Obtém a sessão atual ou cria uma identificação anônima.
export async function getOrCreateSession() {
  // Primeiro verificamos se já existe uma sessão.
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  // Se já estiver autenticado, reutilizamos a sessão.
  if (sessionData.session) {
    return sessionData.session;
  }

  // Caso contrário, criamos uma nova identidade anônima.
  const { data, error } =
    await supabase.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error("Não foi possível criar sua sessão.");
  }

  return data.session;
}

// Encerra a sessão atual.
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
}
