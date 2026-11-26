import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getPlayerRoomData } from "../../services/gameSession";

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

type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
  score: number;
};

type GuessResult = {
  isCorrect: boolean;
  pointsAwarded: number;
  message: string;
};

function PlayerGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const player = useMemo(() => getPlayerRoomData(location.state), [location.state]);

  const [game, setGame] = useState<PublicGameState | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [isTargetPlayer, setIsTargetPlayer] = useState<boolean | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guessSubmitted, setGuessSubmitted] = useState(false);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
  const [hasCorrectlyGuessedRound, setHasCorrectlyGuessedRound] = useState(false);
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
        .select("round_id, round_number, question_number, phase, clue_question, clue_answer, revealed_player_name, reveal_results")
        .eq("room_id", roomId)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar a pista:", queryError);
        setError("Não foi possível carregar a pista da rodada.");
        return;
      }

      if (!data) return;

      const publicState: PublicGameState = {
        ...data,
        reveal_results: Array.isArray(data.reveal_results)
          ? data.reveal_results as RevealResult[]
          : null,
      };
      setGame(publicState);
      setError("");

      // Só precisamos descobrir se o jogador é o alvo enquanto a rodada recebe palpites.
      if (data.phase === "asking") {
        const { data: roleData, error: roleError } = await supabase.functions.invoke(
          "get-player-round-role",
          { body: { roomId, playerId: player!.playerId } }
        );

        if (!active) return;

        if (roleError || !roleData?.success) {
          console.error("Erro ao verificar papel do jogador:", roleError, roleData);
          setIsTargetPlayer(null);
          setError(roleData?.message || "Não foi possível verificar sua participação nesta rodada.");
        } else if (roleData.roundId === data.round_id) {
          setIsTargetPlayer(Boolean(roleData.isTargetPlayer));
        }
      } else {
        setIsTargetPlayer(false);
      }
    }

    async function loadPlayers() {
      const { data, error: playersError } = await supabase
        .from("room_players")
        .select("id, player_name, player_status, score")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (!active) return;

      if (playersError) {
        console.error("Erro ao carregar participantes:", playersError);
        setError("Não foi possível carregar a lista de participantes.");
      } else {
        setPlayers(data ?? []);
      }
    }

    loadGameState();
    loadPlayers();

    const channel = supabase
      .channel(`player-game-${roomId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "game_public_state",
        filter: `room_id=eq.${roomId}`,
      }, loadGameState)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "room_players",
        filter: `room_id=eq.${roomId}`,
      }, loadPlayers)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [navigate, player]);

  // Ao começar uma nova rodada, limpa o estado da rodada anterior.
  // O acerto fica guardado durante as três pistas da mesma rodada.
  useEffect(() => {
    setSelectedPlayerId("");
    setGuessSubmitted(false);
    setGuessResult(null);
    setHasCorrectlyGuessedRound(false);
    setIsTargetPlayer(null);
    setError("");
  }, [game?.round_id]);

  // Quando chega uma nova pista, libera uma nova tentativa somente para
  // quem ainda não acertou nesta rodada.
  useEffect(() => {
    setSelectedPlayerId("");
    setGuessSubmitted(false);
    setGuessResult(null);
    setIsTargetPlayer(null);
    setError("");
  }, [game?.question_number]);

  async function handleSubmitGuess() {
    if (!player || !game || !selectedPlayerId || isSubmitting || guessSubmitted || isTargetPlayer !== false) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "submit-guess",
        {
          body: {
            roomId: player.roomId,
            playerId: player.playerId,
            guessedPlayerId: selectedPlayerId,
          },
        }
      );

      if (functionError || !data?.success) {
        console.error("Erro ao enviar palpite:", functionError, data);
        setError(data?.message || "Não foi possível registrar seu palpite. Tente novamente.");
        return;
      }

      setGuessSubmitted(true);
      if (Boolean(data.isCorrect)) {
        setHasCorrectlyGuessedRound(true);
      }
      setGuessResult({
        isCorrect: Boolean(data.isCorrect),
        pointsAwarded: Number(data.pointsAwarded) || 0,
        message: data.message || "Palpite registrado.",
      });
    } catch (submitError) {
      console.error("Erro inesperado ao enviar palpite:", submitError);
      setError("Ocorreu um erro ao enviar seu palpite. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!player) {
    return <main className="flow-screen"><p>Recuperando sua participação...</p></main>;
  }

  const availablePlayers = players.filter((roomPlayer) => roomPlayer.id !== player.playerId);
  const ranking = [...players].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));

  return (
    <main className="flow-screen flow-game-screen">
      <section className="flow-card flow-game-card">
        <span className="flow-eyebrow">QUEM SOU EU? · {player.playerName}</span>
        <h1>{game?.phase === "finished" ? "Partida finalizada!" : "Partida em andamento"}</h1>

        {error && <p className="flow-error">{error}</p>}

        {!game ? (
          <p className="flow-empty">Carregando a primeira pista...</p>
        ) : game.phase === "finished" ? (
          <section className="flow-ranking">
            <h2>Classificação final</h2>
            <p>Confira como terminou a partida.</p>
            {ranking.map((roomPlayer, index) => (
              <div className="flow-ranking-row" key={roomPlayer.id}>
                <strong className="flow-ranking-position">{index + 1}º</strong>
                <span>{roomPlayer.player_name}</span>
                <b>{Number(roomPlayer.score) || 0} pts</b>
              </div>
            ))}
            <button
              type="button"
              className="flow-button flow-button-primary flow-action-button"
              onClick={() => {
                // Limpa os dados desta sala para não reutilizá-los ao voltar.
                sessionStorage.removeItem("playerRoomData");
                navigate("/", { replace: true });
              }}
            >
              SAIR
            </button>
          </section>
        ) : (
          <>
            <div className="flow-round-label">
              RODADA {game.round_number}
              <span>·</span>
              {game.phase === "revealed" ? "RODADA REVELADA" : `PERGUNTA ${game.question_number} DE 3`}
            </div>

            {game.phase !== "revealed" && (
              <>
                <div className="flow-clue-block">
                  <span>PERGUNTA</span>
                  <h2>{game.clue_question}</h2>
                </div>
                <div className="flow-clue-block flow-answer-block">
                  <span>PISTA</span>
                  <h2>{game.clue_answer}</h2>
                </div>
              </>
            )}

            {game.phase === "revealed" ? (
              <section className="flow-reveal-panel">
                <span className="flow-eyebrow">A PESSOA ERA</span>
                <h2 className="flow-revealed-name">{game.revealed_player_name}</h2>

                {/* O bônus é exibido somente para a pessoa sorteada,
                    e apenas quando nenhum palpite da rodada foi correto. */}
                {game.revealed_player_name === player.playerName &&
                  !(game.reveal_results ?? []).some((result) => result.isCorrect) && (
                    <div className="flow-bonus-message" role="status">
                      <strong>Ninguém te descobriu!</strong>
                      <span>+1 pt</span>
                    </div>
                  )}

                <h3>Pontuação atual</h3>
                <div className="flow-results-list">
                  {ranking.map((roomPlayer) => (
                    <div className="flow-result-row" key={roomPlayer.id}>
                      <strong>{roomPlayer.player_name}</strong>
                      <span>{Number(roomPlayer.score) || 0} pts</span>
                    </div>
                  ))}
                </div>
                <p className="flow-note">Aguarde o anfitrião iniciar a próxima rodada.</p>
              </section>
            ) : isTargetPlayer === null ? (
              <p className="flow-note">Verificando sua participação nesta rodada...</p>
            ) : isTargetPlayer ? (
              <section className="flow-target-message" role="status">
                <span className="flow-target-icon" aria-hidden="true">🤫</span>
                <h2>Você é a pessoa desta rodada!</h2>
                <p>
                  Não fale nada e mantenha o segredo! Agora é a vez dos seus
                  colegas tentarem descobrir quem é você.
                </p>
              </section>
            ) : hasCorrectlyGuessedRound ? (
              <section className="flow-target-message" role="status">
                <span className="flow-target-icon" aria-hidden="true">✓</span>
                <h2>Você já acertou!</h2>
                <p>
                  Você já descobriu quem é a pessoa desta rodada. Aguarde seus
                  colegas terminarem os palpites.
                </p>
              </section>
            ) : game.phase === "asking" ? (
              <section className="flow-guess-section">
                <div className="flow-guess-heading">
                  <h2>Quem você acha que é?</h2>
                  <p>Escolha um colega. Você não pode votar em si mesmo.</p>
                </div>

                {guessSubmitted && guessResult ? (
                  <div className={`flow-guess-result ${guessResult.isCorrect ? "is-correct" : "is-incorrect"}`} role="status">
                    <strong>{guessResult.isCorrect ? "Você acertou!" : "Palpite registrado"}</strong>
                    <p>{guessResult.message}</p>
                    {guessResult.isCorrect && <span>+{guessResult.pointsAwarded} pontos</span>}
                    <small>Aguarde o anfitrião avançar para a próxima pista.</small>
                  </div>
                ) : (
                  <>
                    {availablePlayers.length === 0 ? (
                      <p className="flow-empty">Não há outros participantes para escolher.</p>
                    ) : (
                      <div className="flow-guess-options">
                        {availablePlayers.map((roomPlayer) => (
                          <button
                            key={roomPlayer.id}
                            type="button"
                            className={`flow-guess-option ${selectedPlayerId === roomPlayer.id ? "is-selected" : ""}`}
                            onClick={() => setSelectedPlayerId(roomPlayer.id)}
                            disabled={isSubmitting}
                          >
                            <span className="flow-avatar">{roomPlayer.player_name.charAt(0).toUpperCase()}</span>
                            <span>{roomPlayer.player_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="flow-button flow-button-primary flow-guess-submit"
                      onClick={handleSubmitGuess}
                      disabled={!selectedPlayerId || isSubmitting || isTargetPlayer !== false}
                    >
                      {isSubmitting ? "ENVIANDO PALPITE..." : "CONFIRMAR PALPITE"}
                    </button>
                  </>
                )}
              </section>
            ) : (
              <p className="flow-note">Esta etapa não está aceitando palpites. Aguarde as orientações do anfitrião.</p>
            )}

            {game.phase === "asking" && (
              <p className="flow-note">A identidade será revelada somente no momento definido pelo anfitrião.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default PlayerGame;
