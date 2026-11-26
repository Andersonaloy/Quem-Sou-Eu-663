
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";

import "./Host.css";

// Estrutura de cada pergunta cadastrada.
type Question = {
  id: string;
  text: string;
};

function Host() {
  const navigate = useNavigate();

  // =========================================
  // ESTADOS DO ANFITRIÃO
  // =========================================

  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // =========================================
  // ESTADOS DAS PERGUNTAS
  // =========================================

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionDraft, setQuestionDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState("");

  // =========================================
  // ESTADOS DA SALA
  // =========================================

  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState("");

  // =========================================
  // VERIFICAÇÃO DO ACESSO DO ANFITRIÃO
  // =========================================

  useEffect(() => {
    let isMounted = true;

    async function checkHostAccess() {
      try {
        const { data, error } = await supabase.functions.invoke(
          "host-check",
          { body: {} }
        );

        if (error) throw error;

        if (!data?.authorized) {
          navigate("/", { replace: true });
          return;
        }

        if (isMounted) {
          setIsAuthorized(true);
        }
      } catch (error) {
        console.error("Erro ao verificar acesso do anfitrião:", error);

        if (isMounted) {
          navigate("/", { replace: true });
        }
      } finally {
        if (isMounted) {
          setIsChecking(false);
        }
      }
    }

    checkHostAccess();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  // =========================================
  // CADASTRO DE PERGUNTAS
  // =========================================

  // Adiciona uma pergunta nova ou salva uma edição.
  function handleSaveQuestion() {
    const questionText = questionDraft.trim();

    if (!questionText) {
      setQuestionError("Digite uma pergunta antes de adicionar.");
      return;
    }

    if (questionText.length < 5) {
      setQuestionError("A pergunta precisa ter pelo menos 5 caracteres.");
      return;
    }

    if (questionText.length > 300) {
      setQuestionError("A pergunta pode ter no máximo 300 caracteres.");
      return;
    }

    // Impede perguntas duplicadas, ignorando maiúsculas e minúsculas.
    const alreadyExists = questions.some(
      (question) =>
        question.text.toLowerCase() === questionText.toLowerCase() &&
        question.id !== editingId
    );

    if (alreadyExists) {
      setQuestionError("Essa pergunta já foi cadastrada.");
      return;
    }

    if (editingId) {
      // Atualiza a pergunta que está sendo editada.
      setQuestions((currentQuestions) =>
        currentQuestions.map((question) =>
          question.id === editingId
            ? { ...question, text: questionText }
            : question
        )
      );

      setEditingId(null);
    } else {
      // Adiciona uma nova pergunta à lista.
      setQuestions((currentQuestions) => [
        ...currentQuestions,
        {
          id: crypto.randomUUID(),
          text: questionText,
        },
      ]);
    }

    setQuestionDraft("");
    setQuestionError("");
    setRoomError("");
  }

  // Prepara uma pergunta para edição.
  function handleEditQuestion(question: Question) {
    setQuestionDraft(question.text);
    setEditingId(question.id);
    setQuestionError("");
  }

  // Remove uma pergunta da lista.
  function handleDeleteQuestion(id: string) {
    const confirmed = window.confirm(
      "Deseja realmente excluir esta pergunta?"
    );

    if (!confirmed) return;

    setQuestions((currentQuestions) =>
      currentQuestions.filter((question) => question.id !== id)
    );

    // Se a pergunta excluída estava em edição, limpa o formulário.
    if (editingId === id) {
      setEditingId(null);
      setQuestionDraft("");
    }

    setQuestionError("");
    setRoomError("");
  }

  // Cancela uma edição e limpa o formulário.
  function handleCancelEdit() {
    setEditingId(null);
    setQuestionDraft("");
    setQuestionError("");
  }

  // =========================================
  // CRIAÇÃO DA SALA
  // =========================================

  // Envia as perguntas para o servidor criar uma sala.
  async function handleCreateRoom() {
    if (questions.length < 3) {
      setQuestionError(
        "Cadastre pelo menos 3 perguntas para criar uma sala."
      );
      return;
    }

    setIsCreatingRoom(true);
    setRoomError("");

    try {
      // A Edge Function valida o anfitrião, gera o código
      // e cria a sala junto com todas as perguntas.
      const { data, error } = await supabase.functions.invoke(
        "create-room",
        {
          body: {
            questions: questions.map((question) => question.text),
          },
        }
      );

      if (error) {
        console.error("Erro ao chamar create-room:", error);
        throw new Error("Não foi possível comunicar com o servidor.");
      }

      if (!data?.success || !data?.room?.id || !data?.room?.code) {
        throw new Error(
          data?.error || "O servidor não retornou os dados da sala."
        );
      }

      // Guarda os dados da sala para que o anfitrião possa
      // continuar mesmo se atualizar a página da sala de espera.
      const roomData = {
        id: data.room.id as string,
        code: data.room.code as string,
      };

      sessionStorage.setItem("hostRoomData", JSON.stringify(roomData));

      // A sala de espera agora é uma página independente.
      navigate("/host/lobby", {
        state: { roomId: roomData.id, roomCode: roomData.code },
      });
    } catch (error) {
      console.error("Erro ao criar sala:", error);

      setRoomError(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro inesperado ao criar a sala."
      );
    } finally {
      setIsCreatingRoom(false);
    }
  }

  // =========================================
  // ESTADOS DE CARREGAMENTO E AUTORIZAÇÃO
  // =========================================

  // Enquanto verificamos a autorização, não mostramos o painel.
  if (isChecking) {
    return (
      <main className="loading-screen">
        <h2>QUEM SOU EU?</h2>
        <p>Verificando acesso...</p>
      </main>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  // =========================================
  // TELA DO ANFITRIÃO
  // =========================================

  return (
    <main className="host-container">
      <header className="host-header">
        <div>
          <span className="host-eyebrow">PAINEL DE CONTROLE</span>
          <h1>CRIAR PARTIDA</h1>
          <p>Prepare as perguntas que serão utilizadas no jogo.</p>
        </div>

        <button
          className="host-back-button"
          onClick={() => navigate("/")}
        >
          VOLTAR AO INÍCIO
        </button>
      </header>

      <section className="host-panel">
        {/* =====================================
            ETAPA 01 — BANCO DE PERGUNTAS
        ====================================== */}

        <div className="host-section-heading">
          <div>
            <span className="host-step">ETAPA 01</span>
            <h2>Banco de perguntas</h2>
            <p>
              Cadastre perguntas que os participantes deverão responder
              sobre si mesmos.
            </p>
          </div>

          <div className="question-counter">
            <strong>{questions.length}</strong>
            <span>PERGUNTAS</span>
          </div>
        </div>

        {/* Formulário para adicionar ou editar perguntas */}
        <div className="question-form">
          <label htmlFor="question-input">
            {editingId ? "EDITAR PERGUNTA" : "NOVA PERGUNTA"}
          </label>

          <textarea
            id="question-input"
            value={questionDraft}
            onChange={(event) => {
              setQuestionDraft(event.target.value);
              setQuestionError("");
            }}
            placeholder="Ex.: Qual foi a maior aventura que você já viveu?"
            maxLength={300}
            rows={3}
          />

          <div className="question-form-footer">
            <span>{questionDraft.length}/300 caracteres</span>

            <div className="question-form-actions">
              {editingId && (
                <button
                  className="button-secondary"
                  onClick={handleCancelEdit}
                >
                  CANCELAR
                </button>
              )}

              <button
                className="button-primary"
                onClick={handleSaveQuestion}
              >
                {editingId ? "SALVAR ALTERAÇÃO" : "ADICIONAR PERGUNTA"}
              </button>
            </div>
          </div>

          {questionError && (
            <p className="question-error">{questionError}</p>
          )}
        </div>

        {/* Lista de perguntas cadastradas */}
        <div className="question-list-section">
          <div className="question-list-heading">
            <h3>Perguntas cadastradas</h3>
            <span>{questions.length} itens</span>
          </div>

          {questions.length === 0 ? (
            <div className="question-empty">
              <span className="empty-icon">?</span>
              <strong>Nenhuma pergunta cadastrada</strong>
              <p>
                Comece adicionando perguntas para montar sua partida.
              </p>
            </div>
          ) : (
            <div className="question-list">
              {questions.map((question, index) => (
                <article className="question-item" key={question.id}>
                  <span className="question-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <p>{question.text}</p>

                  <div className="question-item-actions">
                    <button
                      className="icon-button edit-button"
                      onClick={() => handleEditQuestion(question)}
                      aria-label="Editar pergunta"
                      title="Editar pergunta"
                    >
                      <span>✎</span>
                    </button>

                    <button
                      className="icon-button delete-button"
                      onClick={() => handleDeleteQuestion(question.id)}
                      aria-label="Excluir pergunta"
                      title="Excluir pergunta"
                    >
                      <span>×</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* =====================================
            CRIAÇÃO DA SALA
        ====================================== */}

        <div className="create-room-section">
          <div>
            <strong>Pronto para criar sua partida?</strong>
            <p>
              Você precisa cadastrar pelo menos 3 perguntas.
            </p>
          </div>

          <button
            className="button-primary create-room-button"
            onClick={handleCreateRoom}
            disabled={questions.length < 3 || isCreatingRoom}
          >
            {isCreatingRoom ? "CRIANDO SALA..." : "CRIAR SALA"}
          </button>
        </div>

        {roomError && (
          <p className="room-error">{roomError}</p>
        )}

      </section>
    </main>
  );
}

export default Host;
