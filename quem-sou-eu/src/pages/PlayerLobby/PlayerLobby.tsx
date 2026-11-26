import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getPlayerRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
};

function PlayerLobby() {
  const location = useLocation();
  const navigate = useNavigate();
  const player = useMemo(
    () => getPlayerRoomData(location.state),
    [location.state]
  );

  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!player?.roomId) {
      navigate("/", { replace: true });
      return;
    }
    const roomId = player.roomId;

    let active = true;

    async function checkRoomStatus() {
      const { data, error: statusError } = await supabase
        .from("game_rooms")
        .select("status")
        .eq("id", roomId)
        .maybeSingle();

      if (!active) return;

      if (statusError) {
        console.error("Erro ao verificar a sala:", statusError);
        setError("Não foi possível verificar o início da partida.");
        return;
      }

      if (data?.status === "playing") {
        navigate("/player/game", { replace: true, state: player });
      }
    }

    async function loadPlayers() {
      const { data, error: queryError } = await supabase
        .from("room_players")
        .select("id, player_name, player_status")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar participantes:", queryError);
        setError("Não foi possível carregar os participantes.");
      } else {
        setPlayers(data ?? []);
        setError("");
      }
      setLoading(false);
    }

    checkRoomStatus();
    loadPlayers();

    const channel = supabase
      .channel(`player-waiting-${roomId}`)
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_rooms",
          filter: `id=eq.${roomId}`,
        },
        checkRoomStatus
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [navigate, player]);

  function statusLabel(status: string) {
    const labels: Record<string, string> = {
      answering: "Respondendo",
      ready: "Pronto",
      playing: "Em partida",
      finished: "Finalizou",
      disconnected: "Desconectado",
    };
    return labels[status] ?? "Aguardando";
  }

  if (!player) {
    return <main className="flow-screen"><p>Recuperando sua participação...</p></main>;
  }

  return (
    <main className="flow-screen">
      <section className="flow-card">
        <span className="flow-eyebrow">QUEM SOU EU? · JOGADOR</span>
        <h1>Você está pronto!</h1>
        <p className="flow-description">
          Suas respostas foram enviadas. Aguarde enquanto o anfitrião prepara
          o início da partida.
        </p>

        <div className="flow-waiting-indicator">
          <span className="flow-pulse" />
          <strong>Aguardando o anfitrião iniciar...</strong>
        </div>

        <div className="flow-section-heading">
          <div>
            <h2>Sala {player.roomCode}</h2>
            <p>Participantes conectados</p>
          </div>
          <span className="flow-count">{players.length}</span>
        </div>

        {loading ? (
          <p className="flow-empty">Atualizando participantes...</p>
        ) : (
          <div className="flow-player-list">
            {players.map((item) => (
              <article className="flow-player" key={item.id}>
                <span className="flow-avatar">
                  {item.player_name.charAt(0).toUpperCase()}
                </span>
                <span className="flow-player-name">
                  <strong>
                    {item.player_name}{item.id === player.playerId ? " (Você)" : ""}
                  </strong>
                  <small>{statusLabel(item.player_status)}</small>
                </span>
              </article>
            ))}
          </div>
        )}

        {error && <p className="flow-error">{error}</p>}
      </section>
    </main>
  );
}

export default PlayerLobby;
