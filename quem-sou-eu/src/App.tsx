
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home/Home";
import Host from "./pages/Host/Host";
import Player from "./pages/Player/Player";

import { getOrCreateSession } from "./services/auth";

import "./App.css";

function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    // Garante que o visitante tenha uma identidade no Supabase.
    async function initializeAuth() {
      try {
        await getOrCreateSession();
        setAuthReady(true);
      } catch (error) {
        console.error("Erro na autenticação:", error);
        setAuthError("Não foi possível conectar ao servidor.");
      }
    }

    initializeAuth();
  }, []);

  // Enquanto a autenticação acontece, não mostramos as páginas.
  if (!authReady && !authError) {
    return (
      <main className="loading-screen">
        <h2>QUEM SOU EU?</h2>
        <p>Preparando o jogo...</p>
      </main>
    );
  }

  if (authError) {
    return (
      <main className="loading-screen">
        <h2>Ops!</h2>
        <p>{authError}</p>
        <button onClick={() => window.location.reload()}>
          TENTAR NOVAMENTE
        </button>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/host" element={<Host />} />
        <Route path="/player" element={<Player />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
