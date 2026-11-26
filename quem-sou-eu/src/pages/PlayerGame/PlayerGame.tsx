import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getPlayerRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type PublicGameState = {
  round_number: number;
  question_number: number;
  phase: string;
  clue_question: string;
  clue_answer: string;
};

function PlayerGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const player = useMemo(
    () => getPlayerRoomData(location.state),
    [location.state]
  );

  const [game, setGame] = useState<PublicGameState | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!player?.roomId) {
      navigate("/", { replace: true });
      return;
    }
    const roomId = player.roomId;

    let active = true;

    async function loadGameState() {
      const { data, error: queryError } = await supabase
        .from("game_public_state")
        .select("round_number, question_number, phase, clue_question, clue_answer")
        .eq("room_id", roomId)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar a pista:", queryError);
        setError("Não foi possível carregar a pista da rodada.");
      } else if (data) {
        setGame(data);
        setError("");
      }
    }

    loadGameState();

    const channel = supabase
      .channel(`player-game-${roomId}`)
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
  }, [navigate, player]);

  if (!player) {
    return <main className="flow-screen"><p>Recuperando sua participação...</p></main>;
  }

  return (
    <main className="flow-screen flow-game-screen">
      <section className="flow-card flow-game-card">
        <span className="flow-eyebrow">QUEM SOU EU? · {player.playerName}</span>
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
              <span>PISTA</span>
              <h2>{game.clue_answer}</h2>
            </div>
            <p className="flow-note">
              Fique atento às pistas. A identidade será revelada no momento
              definido pelo anfitrião.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export default PlayerGame;
