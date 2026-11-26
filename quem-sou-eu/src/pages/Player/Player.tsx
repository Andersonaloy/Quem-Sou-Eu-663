
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";
import { getPlayerRoomData } from "../../services/gameSession";

import "./Player.css";

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
  const playerData = getPlayerRoomData(location.state);

  // Guarda os identificadores para utilizar nos efeitos.
  const roomId = playerData?.roomId;
  const playerId = playerData?.playerId;

  // Perguntas e respostas do jogador.
  const [questions, setQuestions] = useState<PlayerQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestion, setCurrentQuestion] = useState(0);

  // Estados da tela.
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(true);
  const [questionsError, setQuestionsError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Busca as três perguntas atribuídas ao jogador.
  useEffect(() => {
    if (!roomId || !playerId) return;

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

    // As respostas foram salvas. Agora o jogador vai para
    // uma página exclusiva de espera, sem misturar as etapas.
    setIsSubmitting(false);
    navigate("/player/lobby", { state: playerData });
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

      </section>
    </main>
  );
}

export default Player;
