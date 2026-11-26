import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getHostRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type RevealResult = {
  playerName: string;
  guessedName: string;
  questionNumber: number;
  isCorrect: boolean;
  pointsAwarded: number;
};

type PublicGameState = {
  round_id: string;
  round_number: number;
  question_number: number;
  phase: string;
  clue_question: string;
  clue_answer: string;
  revealed_player_name: string | null;
  reveal_results: RevealResult[] | null;
};

type RankingPlayer = {
  id: string;
  player_name: string;
  score: number;
};

type RoundParticipation = {
  answeredCount: number;
  totalPlayers: number;
};

function HostGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const room = useMemo(() => getHostRoomData(location.state), [location.state]);

  const [authorized, setAuthorized] = useState(false);
  const [game, setGame] = useState<PublicGameState | null>(null);
  const [ranking, setRanking] = useState<RankingPlayer[]>([]);
  const [participation, setParticipation] = useState<RoundParticipation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

    return () => { active = false; };
  }, [navigate, room]);

  useEffect(() => {
    if (!room?.id || !authorized) return;
    const roomId = room.id;
    let active = true;

    async function loadGameState() {
      const { data, error: queryError } = await supabase
        .from("game_public_state")
        .select("round_id, round_number, question_number, phase, clue_question, clue_answer, revealed_player_name, reveal_results")
        .eq("room_id", roomId)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar a partida:", queryError);
        setError("Não foi possível carregar os dados da partida.");
      } else if (data) {
        setGame({
          ...data,
          reveal_results: Array.isArray(data.reveal_results)
            ? data.reveal_results as RevealResult[]
            : null,
        });
        setError("");
      }
    }

    async function loadRanking() {
      const { data, error: rankingError } = await supabase
        .from("room_players")
        .select("id, player_name, score")
        .eq("room_id", roomId)
        .order("score", { ascending: false });

      if (!active) return;
      if (rankingError) {
        console.error("Erro ao carregar classificação:", rankingError);
      } else {
        setRanking(data ?? []);
      }
    }

    loadGameState();
    loadRanking();

    const channel = supabase
      .channel(`host-game-${roomId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "game_public_state",
        filter: `room_id=eq.${roomId}`,
      }, loadGameState)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "room_players",
        filter: `room_id=eq.${roomId}`,
      }, loadRanking)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [room?.id, authorized]);

  // Atualiza somente os números de participação. Nenhum nome de jogador é retornado.
  // A consulta é repetida periodicamente porque os palpites são gravados por Edge Function.
  useEffect(() => {
    if (!room?.id || !authorized || !game?.round_id || game.phase !== "asking") {
      setParticipation(null);
      return;
    }

    const roomId = room.id;
    let active = true;

    async function loadParticipation() {
      const { data, error: participationError } = await supabase.functions.invoke(
        "get-round-participation",
        { body: { roomId } }
      );

      if (!active) return;

      if (participationError || !data?.success) {
        console.error("Erro ao consultar participação da rodada:", participationError, data);
        return;
      }

      setParticipation({
        answeredCount: Number(data.answeredCount) || 0,
        totalPlayers: Number(data.totalPlayers) || 0,
      });
    }

    loadParticipation();
    const intervalId = window.setInterval(loadParticipation, 2500);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [room?.id, authorized, game?.round_id, game?.question_number, game?.phase]);

  async function runHostAction(functionName: string, successMessage: string) {
    if (!room?.id || isProcessing) return;

    setIsProcessing(true);
    setError("");
    setNotice("");

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        functionName,
        { body: { roomId: room.id } }
      );

      if (functionError || !data?.success) {
        console.error(`Erro na função ${functionName}:`, functionError, data);
        setError(data?.message || "Não foi possível executar esta ação.");
        return;
      }

      setNotice(data.message || successMessage);
      if (data.finished) {
        const { data: finalRanking } = await supabase
          .from("room_players")
          .select("id, player_name, score")
          .eq("room_id", room.id)
          .order("score", { ascending: false });
        setRanking(finalRanking ?? []);
      }
    } catch (actionError) {
      console.error(`Erro inesperado na função ${functionName}:`, actionError);
      setError("Ocorreu um erro inesperado. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  }

  if (!room || !authorized) {
    return <main className="flow-screen"><p>Preparando a partida...</p></main>;
  }

  return (
    <main className="flow-screen flow-game-screen">
      <section className="flow-card flow-game-card">
        <span className="flow-eyebrow">PAINEL DO ANFITRIÃO · {room.code}</span>
        <h1>{game?.phase === "finished" ? "Partida finalizada!" : "Partida em andamento"}</h1>

        {error && <p className="flow-error">{error}</p>}
        {notice && <p className="flow-success" role="status">{notice}</p>}

        {!game ? (
          <p className="flow-empty">Carregando a primeira pista...</p>
        ) : game.phase === "finished" ? (
          <section className="flow-ranking">
            <h2>Classificação final</h2>
            <p>Confira a pontuação de todos os participantes.</p>
            {ranking.map((player, index) => (
              <div className="flow-ranking-row" key={player.id}>
                <strong className="flow-ranking-position">{index + 1}º</strong>
                <span>{player.player_name}</span>
                <b>{Number(player.score) || 0} pts</b>
              </div>
            ))}
          </section>
        ) : (
          <>
            <div className="flow-round-label">
              RODADA {game.round_number}
              <span>·</span>
              {game.phase === "revealed" ? "RODADA REVELADA" : `PERGUNTA ${game.question_number} DE 3`}
            </div>

            {game.phase === "asking" && participation && (
              <section className="flow-participation" aria-live="polite">
                <div className="flow-participation-heading">
                  <div>
                    <strong>Participação nesta pista</strong>
                    <small>Inclui a pessoa sorteada automaticamente</small>
                  </div>
                  <b>
                    {participation.answeredCount}/{participation.totalPlayers}
                  </b>
                </div>
                <div
                  className="flow-participation-track"
                  role="progressbar"
                  aria-label="Participação dos jogadores"
                  aria-valuemin={0}
                  aria-valuemax={participation.totalPlayers}
                  aria-valuenow={participation.answeredCount}
                >
                  <span
                    style={{
                      width: participation.totalPlayers > 0
                        ? `${Math.min(100, (participation.answeredCount / participation.totalPlayers) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </section>
            )}

            {game.phase !== "revealed" && (
              <>
                <div className="flow-clue-block">
                  <span>PERGUNTA</span>
                  <h2>{game.clue_question}</h2>
                </div>
                <div className="flow-clue-block flow-answer-block">
                  <span>RESPOSTA / PISTA</span>
                  <h2>{game.clue_answer}</h2>
                </div>
              </>
            )}

            {game.phase === "revealed" ? (
              <section className="flow-reveal-panel">
                <span className="flow-eyebrow">A PESSOA ERA</span>
                <h2 className="flow-revealed-name">{game.revealed_player_name}</h2>
                <h3>Pontuação atual</h3>
                <div className="flow-results-list">
                  {ranking.map((player) => (
                    <div className="flow-result-row" key={player.id}>
                      <strong>{player.player_name}</strong>
                      <span>{Number(player.score) || 0} pts</span>
                    </div>
                  ))}
                </div>
                <button
                  className="flow-button flow-button-primary flow-action-button"
                  onClick={() => runHostAction("next-game-round", "Próxima rodada iniciada!")}
                  disabled={isProcessing}
                >
                  {isProcessing ? "AGUARDE..." : "PRÓXIMA RODADA"}
                </button>
              </section>
            ) : (
              <>
                <p className="flow-note">
                  A identidade da pessoa permanece oculta. Avance as pistas no momento que desejar.
                </p>
                {game.question_number < 3 ? (
                  <button
                    className="flow-button flow-button-primary flow-action-button"
                    onClick={() => runHostAction("advance-game-clue", "Próxima pista exibida!")}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "AVANÇANDO..." : "PRÓXIMA PISTA"}
                  </button>
                ) : (
                  <button
                    className="flow-button flow-button-primary flow-action-button"
                    onClick={() => runHostAction("reveal-game-round", "Pessoa revelada!")}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "REVELANDO..." : "REVELAR PESSOA"}
                  </button>
                )}
              </>
            )}
          </>
        )}

        <button
          className="flow-button flow-button-secondary flow-back-button"
          onClick={() => {
            // Remove os dados da sala encerrada antes de voltar ao início.
            sessionStorage.removeItem("hostRoomData");
            navigate("/", { replace: true });
          }}
        >
          SAIR
        </button>
      </section>
    </main>
  );
}

export default HostGame;
