import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home/Home";
import Host from "./pages/Host/Host";
import HostLobby from "./pages/HostLobby/HostLobby";
import HostGame from "./pages/HostGame/HostGame";
import Player from "./pages/Player/Player";
import PlayerLobby from "./pages/PlayerLobby/PlayerLobby";
import PlayerGame from "./pages/PlayerGame/PlayerGame";

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

        {/* Fluxo do anfitrião: configuração → espera → partida. */}
        <Route path="/host" element={<Host />} />
        <Route path="/host/lobby" element={<HostLobby />} />
        <Route path="/host/game" element={<HostGame />} />

        {/* Fluxo do jogador: respostas → espera → partida. */}
        <Route path="/player" element={<Player />} />
        <Route path="/player/lobby" element={<PlayerLobby />} />
        <Route path="/player/game" element={<PlayerGame />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
