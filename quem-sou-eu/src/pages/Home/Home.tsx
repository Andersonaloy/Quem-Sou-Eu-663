
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";

import "./Home.css";

function Home() {
  const navigate = useNavigate();

  // Controla a janela de entrada dos jogadores.
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Controla a janela de autenticação do anfitrião.
  const [showHostModal, setShowHostModal] = useState(false);

  // Dados da entrada dos jogadores.
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoinLoading, setIsJoinLoading] = useState(false);

  // Dados da autenticação do anfitrião.
  const [hostPassword, setHostPassword] = useState("");
  const [hostError, setHostError] = useState("");
  const [isHostLoading, setIsHostLoading] = useState(false);

  // Valida a senha do anfitrião através da Edge Function.
  async function handleHostLogin() {
    if (!hostPassword.trim()) {
      setHostError("Digite a senha do anfitrião.");
      return;
    }

    setIsHostLoading(true);
    setHostError("");

    try {
      // A senha é enviada ao servidor, nunca validada no React.
      const { data, error } = await supabase.functions.invoke(
        "host-login",
        {
          body: {
            password: hostPassword,
          },
        }
      );

      if (error) {
        // Tenta recuperar a mensagem enviada pela Edge Function.
        const response = (
          error as { context?: Response }
        ).context;

        if (response instanceof Response) {
          const details = await response.json();

          throw new Error(
            details.error || "Não foi possível validar a senha."
          );
        }

        throw error;
      }

      if (!data?.success) {
        throw new Error(
          data?.error || "Não foi possível autorizar o anfitrião."
        );
      }

      // A autorização foi confirmada pelo servidor.
      setShowHostModal(false);
      setHostPassword("");
      navigate("/host");
    } catch (error) {
      console.error("Erro na autenticação do anfitrião:", error);

      setHostError(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao validar a senha."
      );
    } finally {
      setIsHostLoading(false);
    }
  }

  // Valida a sala e cadastra o jogador no Supabase.
  async function handleJoinRoom() {
    const normalizedName = playerName.trim();
    const normalizedCode = roomCode.trim().toUpperCase();

    // Validação inicial para evitar chamadas desnecessárias.
    if (!normalizedName || !normalizedCode) {
      setJoinError("Preencha seu nome e o código da sala.");
      return;
    }

    setIsJoinLoading(true);
    setJoinError("");

    try {
      // A Edge Function verifica a sala e cadastra o participante.
      const { data, error } = await supabase.functions.invoke(
        "join-room",
        {
          body: {
            playerName: normalizedName,
            roomCode: normalizedCode,
          },
        }
      );

      if (error) {
        // Recupera a mensagem específica enviada pelo servidor.
        const response = (
          error as { context?: Response }
        ).context;

        if (response instanceof Response) {
          const details = await response.json();

          throw new Error(
            details.error || "Não foi possível entrar na sala."
          );
        }

        throw error;
      }

      if (!data?.success || !data?.room || !data?.player) {
        throw new Error(
          data?.error || "Não foi possível confirmar sua entrada."
        );
      }

      // Fecha a janela e limpa os campos após a entrada confirmada.
      setShowJoinModal(false);
      setPlayerName("");
      setRoomCode("");

      // Mantém os dados básicos da participação durante a navegação
      // entre as páginas do jogador, inclusive após atualizar a tela.
      const playerData = {
        roomId: data.room.id as string,
        roomCode: data.room.code as string,
        playerId: data.player.id as string,
        playerName: data.player.name as string,
      };

      sessionStorage.setItem("playerRoomData", JSON.stringify(playerData));

      // Abre a página exclusiva para responder às perguntas.
      navigate("/player", { state: playerData });
    } catch (error) {
      console.error("Erro ao entrar na sala:", error);

      setJoinError(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro ao entrar na sala."
      );
    } finally {
      setIsJoinLoading(false);
    }
  }

  return (
    <main className="home-container">
      <section className="home-content">
        <h1>QUEM SOU EU?</h1>
        <p>Será que você conhece seus colegas?</p>

        <div className="home-buttons">
          <button onClick={() => setShowHostModal(true)}>
            CRIAR
          </button>

          <button onClick={() => setShowJoinModal(true)}>
            JOGAR
          </button>

          <button onClick={() => window.close()}>
            SAIR
          </button>
        </div>
      </section>

      {/* Janela de autenticação do anfitrião */}
      {showHostModal && (
        <div className="modal-overlay">
          <div className="join-modal">
            <h2>ACESSO DO ANFITRIÃO</h2>

            <p>
              Digite a senha para acessar a área de criação.
            </p>

            <input
              type="password"
              placeholder="Senha do anfitrião"
              value={hostPassword}
              onChange={(event) => {
                setHostPassword(event.target.value);
                setHostError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isHostLoading) {
                  handleHostLogin();
                }
              }}
              disabled={isHostLoading}
            />

            {hostError && (
              <p className="modal-error">{hostError}</p>
            )}

            <button
              onClick={handleHostLogin}
              disabled={isHostLoading}
            >
              {isHostLoading ? "VERIFICANDO..." : "ENTRAR"}
            </button>

            <button
              onClick={() => {
                setShowHostModal(false);
                setHostPassword("");
                setHostError("");
              }}
              disabled={isHostLoading}
            >
              VOLTAR
            </button>
          </div>
        </div>
      )}

      {/* Janela de entrada dos jogadores */}
      {showJoinModal && (
        <div className="modal-overlay">
          <div className="join-modal">
            <h2>ENTRAR NA SALA</h2>

            <p>
              Informe seu nome e o código fornecido pelo anfitrião.
            </p>

            <input
              type="text"
              placeholder="Seu nome"
              value={playerName}
              maxLength={30}
              onChange={(event) => {
                setPlayerName(event.target.value);
                setJoinError("");
              }}
              disabled={isJoinLoading}
            />

            <input
              type="text"
              placeholder="Código da sala"
              value={roomCode}
              maxLength={6}
              onChange={(event) => {
                // Mantém o código em letras maiúsculas.
                setRoomCode(event.target.value.toUpperCase());
                setJoinError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isJoinLoading) {
                  handleJoinRoom();
                }
              }}
              disabled={isJoinLoading}
            />

            {/* Mensagem de erro da entrada */}
            {joinError && (
              <p className="modal-error">{joinError}</p>
            )}

            <button
              onClick={handleJoinRoom}
              disabled={isJoinLoading}
            >
              {isJoinLoading ? "ENTRANDO..." : "ENTRAR"}
            </button>

            <button
              onClick={() => {
                setShowJoinModal(false);
                setPlayerName("");
                setRoomCode("");
                setJoinError("");
              }}
              disabled={isJoinLoading}
            >
              VOLTAR
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default Home;
