import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getPlayerRoomData } from "../../services/gameSession";

import "../GameFlow.css";

type PublicGameState = {
  round_id: string;
  round_number: number;
  question_number: number;
  phase: string;
  clue_question: string;
  clue_answer: string;
};

type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
};

type GuessResult = {
  isCorrect: boolean;
  pointsAwarded: number;
  message: string;
};

function PlayerGame() {
  const location = useLocation();
  const navigate = useNavigate();

  const player = useMemo(
    () => getPlayerRoomData(location.state),
    [location.state]
  );

  const [game, setGame] = useState<PublicGameState | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  // null enquanto o servidor ainda não confirmou se este jogador é o alvo.
  const [isTargetPlayer, setIsTargetPlayer] = useState<boolean | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [guessSubmitted, setGuessSubmitted] = useState(false);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
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
        .select(
          "round_id, round_number, question_number, phase, clue_question, clue_answer"
        )
        .eq("room_id", roomId)
        .maybeSingle();

      if (!active) return;

      if (queryError) {
        console.error("Erro ao carregar a pista:", queryError);
        setError("Não foi possível carregar a pista da rodada.");
      } else if (data) {
        setGame(data);
        setError("");

        // A identidade do participante sorteado nunca é consultada
        // diretamente pelo navegador. O servidor retorna somente
        // se ESTE jogador é ou não a pessoa da rodada.
        const { data: roleData, error: roleError } =
          await supabase.functions.invoke("get-player-round-role", {
            body: {
              roomId,
              playerId: player!.playerId,
            },
          });

        if (!active) return;

        if (roleError || !roleData?.success) {
          console.error("Erro ao verificar papel do jogador:", roleError, roleData);
          setIsTargetPlayer(null);
          setError(
            roleData?.message ||
              "Não foi possível verificar sua participação nesta rodada."
          );
        } else if (roleData.roundId === data.round_id) {
          setIsTargetPlayer(Boolean(roleData.isTargetPlayer));
        }
      }
    }

    async function loadPlayers() {
      const { data, error: playersError } = await supabase
        .from("room_players")
        .select("id, player_name, player_status")
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
  }, [navigate, player]);

  // Uma nova pista libera um novo palpite na interface.
  useEffect(() => {
    setSelectedPlayerId("");
    setGuessSubmitted(false);
    setGuessResult(null);
    setIsTargetPlayer(null);
    setError("");
  }, [game?.round_id, game?.question_number]);

  async function handleSubmitGuess() {
    if (!player || !game || !selectedPlayerId || isSubmitting || guessSubmitted) {
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
        setError(
          data?.message ||
            "Não foi possível registrar seu palpite. Tente novamente."
        );
        return;
      }

      setGuessSubmitted(true);
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
    return (
      <main className="flow-screen">
        <p>Recuperando sua participação...</p>
      </main>
    );
  }

  const availablePlayers = players.filter(
    (roomPlayer) => roomPlayer.id !== player.playerId
  );

  return (
    <main className="flow-screen flow-game-screen">
      <section className="flow-card flow-game-card">
        <span className="flow-eyebrow">
          QUEM SOU EU? · {player.playerName}
        </span>
        <h1>Partida em andamento</h1>

        {error && <p className="flow-error">{error}</p>}

        {!game ? (
          <p className="flow-empty">Carregando a primeira pista...</p>
        ) : (
          <>
            <div className="flow-round-label">
              RODADA {game.round_number}
              <span>·</span>
              PERGUNTA {game.question_number}
            </div>

            <div className="flow-clue-block">
              <span>PERGUNTA</span>
              <h2>{game.clue_question}</h2>
            </div>

            <div className="flow-clue-block flow-answer-block">
              <span>PISTA</span>
              <h2>{game.clue_answer}</h2>
            </div>

            {isTargetPlayer === null ? (
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
            ) : game.phase === "asking" ? (
              <section className="flow-guess-section">
                <div className="flow-guess-heading">
                  <h2>Quem você acha que é?</h2>
                  <p>Escolha um colega. Você não pode votar em si mesmo.</p>
                </div>

                {guessSubmitted && guessResult ? (
                  <div
                    className={`flow-guess-result ${
                      guessResult.isCorrect ? "is-correct" : "is-incorrect"
                    }`}
                    role="status"
                  >
                    <strong>
                      {guessResult.isCorrect ? "Você acertou!" : "Palpite registrado"}
                    </strong>
                    <p>{guessResult.message}</p>
                    {guessResult.isCorrect && (
                      <span>+{guessResult.pointsAwarded} pontos</span>
                    )}
                    <small>
                      Aguarde o anfitrião avançar para a próxima pista.
                    </small>
                  </div>
                ) : (
                  <>
                    {availablePlayers.length === 0 ? (
                      <p className="flow-empty">
                        Não há outros participantes para escolher.
                      </p>
                    ) : (
                      <div className="flow-guess-options">
                        {availablePlayers.map((roomPlayer) => (
                          <button
                            key={roomPlayer.id}
                            type="button"
                            className={`flow-guess-option ${
                              selectedPlayerId === roomPlayer.id
                                ? "is-selected"
                                : ""
                            }`}
                            onClick={() => setSelectedPlayerId(roomPlayer.id)}
                            disabled={isSubmitting}
                          >
                            <span className="flow-avatar">
                              {roomPlayer.player_name.charAt(0).toUpperCase()}
                            </span>
                            <span>{roomPlayer.player_name}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      className="flow-button flow-button-primary flow-guess-submit"
                      onClick={handleSubmitGuess}
                      disabled={!selectedPlayerId || isSubmitting}
                    >
                      {isSubmitting ? "ENVIANDO PALPITE..." : "CONFIRMAR PALPITE"}
                    </button>
                  </>
                )}
              </section>
            ) : (
              <p className="flow-note">
                Esta etapa não está aceitando palpites. Aguarde as orientações
                do anfitrião.
              </p>
            )}

            <p className="flow-note">
              A identidade será revelada somente no momento definido pelo
              anfitrião.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

export default PlayerGame;
