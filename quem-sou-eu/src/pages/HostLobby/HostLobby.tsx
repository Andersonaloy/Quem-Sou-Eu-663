import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getHostRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
};

function HostLobby() {
  const location = useLocation();
  const navigate = useNavigate();
  const room = useMemo(
    () => getHostRoomData(location.state),
    [location.state]
  );

  const [authorized, setAuthorized] = useState(false);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  // Confirma a autorização e carrega a sala que acabou de ser criada.
  useEffect(() => {
    let active = true;

    async function checkHost() {
      const { data, error: authError } = await supabase.functions.invoke(
        "host-check",
        { body: {} }
      );

      if (!active) return;

      if (authError || !data?.authorized) {
        navigate("/", { replace: true });
        return;
      }

      setAuthorized(true);
    }

    if (!room) {
      navigate("/host", { replace: true });
    } else {
      checkHost();
    }

    return () => {
      active = false;
    };
  }, [navigate, room]);

  // Atualiza os participantes em tempo real enquanto o anfitrião aguarda.
  useEffect(() => {
    if (!room?.id || !authorized) return;
    const roomId = room.id;

    let active = true;

    async function loadPlayers() {
      const { data, error: queryError } = await supabase
        .from("room_players")
        .select("id, player_name, player_status")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar jogadores:", queryError);
        setError("Não foi possível carregar os participantes.");
      } else {
        setPlayers(data ?? []);
        setError("");
      }
      setLoading(false);
    }

    loadPlayers();

    const channel = supabase
      .channel(`host-lobby-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        loadPlayers
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, authorized]);

  const readyCount = players.filter(
    (player) => player.player_status === "ready"
  ).length;

  const canStart = players.length >= 2 && readyCount === players.length && !loading;

  async function handleStartGame() {
    if (!room || !canStart || starting) return;

    setStarting(true);
    setError("");

    const { data, error: functionError } = await supabase.functions.invoke(
      "start-game",
      { body: { roomId: room.id } }
    );

    if (functionError || !data?.success) {
      console.error("Erro ao iniciar a partida:", functionError, data);
      setError(data?.message || "Não foi possível iniciar a partida.");
      setStarting(false);
      return;
    }

    navigate("/host/game", {
      state: { roomId: room.id, roomCode: room.code },
    });
  }

  function statusLabel(status: string) {
    const labels: Record<string, string> = {
      answering: "Respondendo às perguntas",
      ready: "Pronto para jogar",
      playing: "Em partida",
      finished: "Finalizou",
      disconnected: "Desconectado",
    };
    return labels[status] ?? "Aguardando";
  }

  if (!room || !authorized) {
    return (
      <main className="flow-screen">
        <p>Preparando sala de espera...</p>
      </main>
    );
  }

  return (
    <main className="flow-screen">
      <section className="flow-card">
        <span className="flow-eyebrow">QUEM SOU EU? · ANFITRIÃO</span>
        <h1>Sala de espera</h1>
        <p className="flow-description">
          Compartilhe o código abaixo. A lista será atualizada conforme seus
          colegas entrarem e enviarem as respostas.
        </p>

        <div className="flow-room-code">
          <span>CÓDIGO DA SALA</span>
          <strong>{room.code}</strong>
          <button
            className="flow-button flow-button-secondary"
            onClick={() => navigator.clipboard.writeText(room.code)}
          >
            COPIAR CÓDIGO
          </button>
        </div>

        <div className="flow-section-heading">
          <div>
            <h2>Participantes</h2>
            <p>{readyCount} de {players.length} jogadores prontos</p>
          </div>
          <span className="flow-count">{players.length}</span>
        </div>

        {loading ? (
          <p className="flow-empty">Carregando participantes...</p>
        ) : players.length === 0 ? (
          <p className="flow-empty">
            Ainda não há jogadores na sala. Compartilhe o código para começar.
          </p>
        ) : (
          <div className="flow-player-list">
            {players.map((player, index) => (
              <article className="flow-player" key={player.id}>
                <span className="flow-avatar">
                  {player.player_name.charAt(0).toUpperCase()}
                </span>
                <span className="flow-player-name">
                  <strong>{player.player_name}</strong>
                  <small>Participante {index + 1}</small>
                </span>
                <span className={`flow-status ${player.player_status === "ready" ? "is-ready" : ""}`}>
                  {statusLabel(player.player_status)}
                </span>
              </article>
            ))}
          </div>
        )}

        {error && <p className="flow-error">{error}</p>}

        <div className="flow-footer">
          <p>
            {players.length < 2
              ? "São necessários pelo menos dois jogadores."
              : canStart
                ? "Todos estão prontos. Você já pode iniciar!"
                : "Aguardando os demais jogadores enviarem suas respostas."}
          </p>
          <button
            className="flow-button flow-button-primary"
            disabled={!canStart || starting}
            onClick={handleStartGame}
          >
            {starting ? "INICIANDO..." : "INICIAR PARTIDA"}
          </button>
        </div>
      </section>
    </main>
  );
}

export default HostLobby;
