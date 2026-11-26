import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getHostRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type PublicGameState = {
  round_number: number;
  question_number: number;
  phase: string;
  clue_question: string;
  clue_answer: string;
};

function HostGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const room = useMemo(
    () => getHostRoomData(location.state),
    [location.state]
  );

  const [authorized, setAuthorized] = useState(false);
  const [game, setGame] = useState<PublicGameState | null>(null);
  const [error, setError] = useState("");

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

    if (!room) navigate("/", { replace: true });
    else checkHost();

    return () => {
      active = false;
    };
  }, [navigate, room]);

  useEffect(() => {
    if (!room?.id || !authorized) return;
    const roomId = room.id;

    let active = true;

    async function loadGameState() {
      const { data, error: queryError } = await supabase
        .from("game_public_state")
        .select("round_number, question_number, phase, clue_question, clue_answer")
        .eq("room_id", roomId)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar a partida:", queryError);
        setError("Não foi possível carregar os dados da partida.");
      } else if (data) {
        setGame(data);
        setError("");
      }
    }

    loadGameState();

    const channel = supabase
      .channel(`host-game-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_public_state",
          filter: `room_id=eq.${roomId}`,
        },
        loadGameState
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, authorized]);

  if (!room || !authorized) {
    return <main className="flow-screen"><p>Preparando a partida...</p></main>;
  }

  return (
    <main className="flow-screen flow-game-screen">
      <section className="flow-card flow-game-card">
        <span className="flow-eyebrow">PAINEL DO ANFITRIÃO</span>
        <h1>Partida em andamento</h1>

        {error && <p className="flow-error">{error}</p>}

        {!game ? (
          <p className="flow-empty">Carregando a primeira pista...</p>
        ) : (
          <>
            <div className="flow-round-label">
              RODADA {game.round_number} <span>·</span> PERGUNTA {game.question_number}
            </div>
            <div className="flow-clue-block">
              <span>PERGUNTA</span>
              <h2>{game.clue_question}</h2>
            </div>
            <div className="flow-clue-block flow-answer-block">
              <span>RESPOSTA / PISTA</span>
              <h2>{game.clue_answer}</h2>
            </div>
            <p className="flow-note">
              A identidade da pessoa permanece oculta até a revelação.
            </p>
          </>
        )}

        <button
          className="flow-button flow-button-secondary"
          onClick={() => navigate("/host/lobby", { state: room })}
        >
          VOLTAR À SALA
        </button>
      </section>
    </main>
  );
}

export default HostGame;
