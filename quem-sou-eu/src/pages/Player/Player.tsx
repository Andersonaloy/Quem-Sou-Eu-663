
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";

import "./Player.css";

// Dados recebidos da tela inicial após a entrada na sala.
type PlayerLocationState = {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerName: string;
};

// Participantes da sala.
type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
};

// Perguntas sorteadas para o jogador.
type PlayerQuestion = {
  questionId: string;
  questionOrder: number;
  questionText: string;
};

// Respostas que serão enviadas ao Supabase.
type PlayerAnswer = {
  questionId: string;
  questionOrder: number;
  answerText: string;
};

function Player() {
  const location = useLocation();
  const navigate = useNavigate();

  // Recupera os dados enviados pelo Home.tsx.
  const playerData = location.state as PlayerLocationState | null;

  // Guarda os identificadores para utilizar nos efeitos.
  const roomId = playerData?.roomId;
  const playerId = playerData?.playerId;

  // Participantes da sala.
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(true);
  const [playersError, setPlayersError] = useState("");

  // Perguntas e respostas do jogador.
  const [questions, setQuestions] = useState<PlayerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);

  // Estados da tela.
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [questionsError, setQuestionsError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Busca as três perguntas atribuídas ao jogador.
  useEffect(() => {
    if (!roomId || !playerId) {
      setIsLoadingQuestions(false);
      return;
    }

    let isActive = true;

    async function loadQuestions() {
      setIsLoadingQuestions(true);
      setQuestionsError("");

      const { data, error } = await supabase.functions.invoke(
        "get-player-questions",
        {
          body: {
            roomId,
            playerId,
          },
        }
      );

      if (!isActive) return;

      if (error || !data?.success) {
        console.error("Erro ao carregar perguntas:", error, data);
        setQuestionsError(
          data?.message || "Não foi possível carregar suas perguntas."
        );
        setIsLoadingQuestions(false);
        return;
      }

      setQuestions(data.questions ?? []);
      setIsLoadingQuestions(false);
    }

    loadQuestions();

    return () => {
      isActive = false;
    };
  }, [roomId, playerId]);

  // Busca e acompanha os participantes da sala em tempo real.
  useEffect(() => {
    if (!roomId) {
      setIsLoadingPlayers(false);
      return;
    }

    let isActive = true;

    async function loadPlayers() {
      const { data, error } = await supabase
        .from("room_players")
        .select("id, player_name, player_status")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      if (!isActive) return;

      if (error) {
        console.error("Erro ao carregar participantes:", error);
        setPlayersError("Não foi possível carregar os participantes.");
        setIsLoadingPlayers(false);
        return;
      }

      setRoomPlayers(data ?? []);
      setPlayersError("");
      setIsLoadingPlayers(false);
    }

    const channel = supabase
      .channel(`player-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadPlayers();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          loadPlayers();
        }
      });

    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Atualiza a resposta da pergunta atual.
  function handleAnswerChange(value: string) {
    const question = questions[currentQuestion];

    if (!question) return;

    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [question.questionId]: value,
    }));
  }

  // Verifica se todas as perguntas foram respondidas.
  const allQuestionsAnswered =
    questions.length === 3 &&
    questions.every(
      (question) => (answers[question.questionId] ?? "").trim().length > 0
    );

  // Envia as três respostas ao Supabase.
  async function handleSubmitAnswers() {
    if (!roomId || !playerId || !allQuestionsAnswered || isSubmitting) {
      return;
    }

    const formattedAnswers: PlayerAnswer[] = questions.map((question) => ({
      questionId: question.questionId,
      questionOrder: question.questionOrder,
      answerText: (answers[question.questionId] ?? "").trim(),
    }));

    setIsSubmitting(true);
    setQuestionsError("");

    const { data, error } = await supabase.functions.invoke(
      "submit-player-answers",
      {
        body: {
          roomId,
          playerId,
          answers: formattedAnswers,
        },
      }
    );

    if (error || !data?.success) {
      console.error("Erro ao enviar respostas:", error, data);

      setQuestionsError(
        data?.message || "Não foi possível enviar suas respostas."
      );

      setIsSubmitting(false);
      return;
    }

    // A função do servidor já altera o status para ready.
    setIsReady(true);
    setIsSubmitting(false);
  }

  // Traduz o status interno dos participantes.
  function getPlayerStatusLabel(status: string) {
    const statuses: Record<string, string> = {
      answering: "Respondendo",
      ready: "Pronto",
      playing: "Em partida",
      finished: "Finalizou",
      disconnected: "Desconectado",
    };

    return statuses[status] ?? "Aguardando";
  }

  // Impede o acesso sem uma entrada válida na sala.
  if (
    !playerData?.roomId ||
    !playerData?.roomCode ||
    !playerData?.playerId ||
    !playerData?.playerName
  ) {
    return (
      <main className="player-container">
        <section className="player-content">
          <h1>ACESSO NÃO IDENTIFICADO</h1>
          <p>Entre em uma sala pela tela inicial para continuar.</p>

          <button onClick={() => navigate("/")}>
            VOLTAR AO INÍCIO
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="player-container">
      <section className="player-content">
        <span className="player-eyebrow">ÁREA DOS JOGADORES</span>

        <h1>QUEM SOU EU?</h1>

        <div className="player-welcome">
          <h2>Olá, {playerData.playerName}!</h2>

          <div className="player-room-code">
            <span>CÓDIGO DA SALA</span>
            <strong>{playerData.roomCode}</strong>
          </div>
        </div>

        {/* Etapa de perguntas e respostas. */}
        <section className="player-questions">
          {isLoadingQuestions ? (
            <div className="player-question-message">
              <h2>Preparando suas perguntas...</h2>
              <p>Estamos sorteando suas três perguntas.</p>
            </div>
          ) : questionsError && questions.length === 0 ? (
            <div className="player-question-message">
              <h2>Não foi possível carregar as perguntas</h2>
              <p>{questionsError}</p>

              <button
                onClick={() => window.location.reload()}
              >
                TENTAR NOVAMENTE
              </button>
            </div>
          ) : isReady ? (
            <div className="player-ready">
              <div className="player-ready-icon">✓</div>

              <h2>VOCÊ ESTÁ PRONTO!</h2>

              <p>
                Suas respostas foram enviadas com sucesso.
                Agora é só aguardar o anfitrião.
              </p>
            </div>
          ) : questions.length === 3 ? (
            <>
              <div className="player-questions-heading">
                <span>SUA PARTICIPAÇÃO</span>
                <h2>Responda às perguntas</h2>
                <p>
                  Responda pensando em você. Seus colegas tentarão
                  descobrir quem é a pessoa descrita.
                </p>
              </div>

              {/* Indicador de progresso das três perguntas. */}
              <div className="player-question-progress">
                {questions.map((question, index) => (
                  <div
                    key={question.questionId}
                    className={`player-progress-step ${
                      index === currentQuestion ? "active" : ""
                    } ${
                      (answers[question.questionId] ?? "").trim()
                        ? "completed"
                        : ""
                    }`}
                  >
                    <span>{index + 1}</span>
                  </div>
                ))}
              </div>

              <div className="player-question-card">
                <span className="player-question-number">
                  PERGUNTA {currentQuestion + 1} DE 3
                </span>

                <h3>{questions[currentQuestion].questionText}</h3>

                <label htmlFor="player-answer">
                  Sua resposta
                </label>

                <textarea
                  id="player-answer"
                  value={
                    answers[questions[currentQuestion].questionId] ?? ""
                  }
                  onChange={(event) =>
                    handleAnswerChange(event.target.value)
                  }
                  placeholder="Digite sua resposta..."
                  maxLength={300}
                  rows={4}
                />

                <span className="player-answer-counter">
                  {(answers[questions[currentQuestion].questionId] ?? "").length}
                  /300 caracteres
                </span>
              </div>

              {questionsError && (
                <p className="player-error">{questionsError}</p>
              )}

              <div className="player-question-actions">
                <button
                  className="player-secondary-button"
                  disabled={currentQuestion === 0 || isSubmitting}
                  onClick={() =>
                    setCurrentQuestion((previous) => previous - 1)
                  }
                >
                  VOLTAR
                </button>

                {currentQuestion < 2 ? (
                  <button
                    className="player-primary-button"
                    disabled={
                      !(answers[questions[currentQuestion].questionId] ?? "").trim()
                    }
                    onClick={() =>
                      setCurrentQuestion((previous) => previous + 1)
                    }
                  >
                    PRÓXIMA PERGUNTA
                  </button>
                ) : (
                  <button
                    className="player-primary-button"
                    disabled={!allQuestionsAnswered || isSubmitting}
                    onClick={handleSubmitAnswers}
                  >
                    {isSubmitting ? "ENVIANDO..." : "ENVIAR RESPOSTAS"}
                  </button>
                )}
              </div>

              <p className="player-question-hint">
                Você pode voltar e alterar suas respostas antes de enviar.
              </p>
            </>
          ) : (
            <div className="player-question-message">
              <h2>Não encontramos suas perguntas</h2>
              <p>Entre em contato com o anfitrião.</p>
            </div>
          )}
        </section>

        {/* Lista de participantes da sala. */}
        <section className="player-lobby">
          <div className="player-lobby-heading">
            <div>
              <h2>Participantes da sala</h2>
              <p>Veja quem já entrou na partida.</p>
            </div>

            <div className="player-counter">
              <strong>{roomPlayers.length}</strong>
              <span>JOGADORES</span>
            </div>
          </div>

          {playersError && (
            <p className="player-error">{playersError}</p>
          )}

          {isLoadingPlayers ? (
            <p className="player-empty">Carregando participantes...</p>
          ) : roomPlayers.length === 0 ? (
            <p className="player-empty">
              Aguardando os participantes...
            </p>
          ) : (
            <div className="player-list">
              {roomPlayers.map((player) => (
                <article className="player-list-item" key={player.id}>
                  <div className="player-avatar">
                    {player.player_name.charAt(0).toUpperCase()}
                  </div>

                  <div className="player-list-info">
                    <strong>
                      {player.player_name}
                      {player.id === playerData.playerId && " (Você)"}
                    </strong>

                    <span>
                      {getPlayerStatusLabel(player.player_status)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

export default Player;
