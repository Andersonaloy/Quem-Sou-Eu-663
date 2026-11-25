
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../services/supabase";

import "./Host.css";

// Estrutura de cada pergunta cadastrada.
type Question = {
  id: string;
  text: string;
};

// Dados retornados após a criação da sala.
type CreatedRoom = {
  id: string;
  code: string;
};

// Dados de cada participante cadastrado na sala.
type RoomPlayer = {
  id: string;
  player_name: string;
  player_status: string;
  joined_at: string;
};

// Dados públicos retornados quando a partida é iniciada.
type StartedGame = {
  roundNumber: number;
  questionNumber: number;
  phase: string;
  clueQuestion: string;
  clueAnswer: string;
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
  const [createdRoom, setCreatedRoom] = useState<CreatedRoom | null>(null);

  // =========================================
  // ESTADOS DOS PARTICIPANTES
  // =========================================

  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [playersError, setPlayersError] = useState("");

  // =========================================
  // INÍCIO DA PARTIDA
  // =========================================

  const [isStartingGame, setIsStartingGame] = useState(false);
  const [startGameError, setStartGameError] = useState("");
  const [startedGame, setStartedGame] = useState<StartedGame | null>(null);

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
  // LOBBY EM TEMPO REAL
  // =========================================

  useEffect(() => {
    // Só acompanha participantes depois que uma sala é criada.
    if (!createdRoom?.id) {
      setRoomPlayers([]);
      setIsLoadingPlayers(false);
      return;
    }

    // Guarda o ID para utilizar com segurança nas funções internas.
    const roomId = createdRoom.id;

    let isActive = true;

    // Busca a lista atual de participantes no banco.
    async function loadPlayers() {
      const { data, error } = await supabase
        .from("room_players")
        .select("id, player_name, player_status, joined_at")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });

      // Evita atualizar a tela se o componente já foi desmontado.
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

    setIsLoadingPlayers(true);
    setPlayersError("");

    // Cria uma conexão para receber alterações na lista de jogadores.
    const channel = supabase
      .channel(`host-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_players",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // Quando alguém entrar ou tiver o status alterado,
          // buscamos novamente a lista atualizada.
          loadPlayers();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          loadPlayers();
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT"
        ) {
          setPlayersError(
            "Não foi possível conectar à atualização em tempo real."
          );
          setIsLoadingPlayers(false);
        }
      });

    // Encerra a conexão quando a sala mudar ou a página for fechada.
    return () => {
      isActive = false;
      supabase.removeChannel(channel);
    };
  }, [createdRoom?.id]);

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
    setCreatedRoom(null);

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

      // Guarda os dados retornados para exibir o código na tela.
      setCreatedRoom({
        id: data.room.id,
        code: data.room.code,
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

  // Copia o código da sala para a área de transferência.
  async function handleCopyRoomCode() {
    if (!createdRoom) return;

    try {
      await navigator.clipboard.writeText(createdRoom.code);
      alert("Código da sala copiado!");
    } catch (error) {
      console.error("Erro ao copiar código:", error);
      setRoomError("Não foi possível copiar o código automaticamente.");
    }
  }

  // =========================================
  // INICIAR PARTIDA
  // =========================================

  async function handleStartGame() {
    if (!createdRoom || isStartingGame) return;

    // Evita chamar o servidor enquanto houver jogadores pendentes.
    if (roomPlayers.length < 2) {
      setStartGameError("São necessários pelo menos dois jogadores.");
      return;
    }

    if (!roomPlayers.every((player) => player.player_status === "ready")) {
      setStartGameError("Aguarde todos os jogadores ficarem prontos.");
      return;
    }

    setIsStartingGame(true);
    setStartGameError("");

    try {
      const { data, error } = await supabase.functions.invoke("start-game", {
        body: {
          roomId: createdRoom.id,
        },
      });

      if (error) {
        console.error("Erro ao chamar start-game:", error);
        throw new Error(
          data?.message ||
            "Não foi possível comunicar com o servidor para iniciar a partida."
        );
      }

      if (
        !data?.success ||
        !data?.round?.clueQuestion ||
        !data?.round?.clueAnswer
      ) {
        throw new Error(
          data?.message || "O servidor não retornou os dados da primeira pista."
        );
      }

      // Guarda apenas a pista pública. A identidade do participante
      // sorteado não é retornada nem exibida nesta tela.
      setStartedGame(data.round);
    } catch (error) {
      console.error("Erro ao iniciar partida:", error);

      setStartGameError(
        error instanceof Error
          ? error.message
          : "Ocorreu um erro inesperado ao iniciar a partida."
      );
    } finally {
      setIsStartingGame(false);
    }
  }

  // =========================================
  // STATUS DOS PARTICIPANTES
  // =========================================

  // Traduz o status interno para uma informação amigável.
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

  // Quantidade de participantes que já enviaram as respostas.
  const readyPlayersCount = roomPlayers.filter(
    (player) => player.player_status === "ready"
  ).length;

  // Só permite iniciar com pelo menos dois jogadores e todos prontos.
  const canStartGame =
    roomPlayers.length >= 2 &&
    readyPlayersCount === roomPlayers.length &&
    !isLoadingPlayers;

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
            disabled={
              questions.length < 3 || isCreatingRoom || Boolean(startedGame)
            }
          >
            {isCreatingRoom
              ? "CRIANDO SALA..."
              : createdRoom
                ? "CRIAR OUTRA SALA"
                : "CRIAR SALA"}
          </button>
        </div>

        {roomError && (
          <p className="room-error">{roomError}</p>
        )}

        {/* =====================================
            ETAPA 02 — SALA E PARTICIPANTES
        ====================================== */}

        {createdRoom && (
          <>
            {/* Código para compartilhar com os jogadores */}
            <section className="created-room">
              <span className="created-room-label">
                SALA CRIADA COM SUCESSO
              </span>

              <h3>Compartilhe o código com os jogadores</h3>

              <div className="created-room-code">
                <strong>{createdRoom.code}</strong>

                <button
                  className="button-primary"
                  onClick={handleCopyRoomCode}
                >
                  COPIAR CÓDIGO
                </button>
              </div>

              <p>
                Os participantes poderão utilizar esse código na tela inicial
                para entrar na partida.
              </p>
            </section>

            {/* Lobby atualizado em tempo real */}
            <section className="room-lobby">
              <div className="room-lobby-heading">
                <div>
                  <span className="host-step">ETAPA 02</span>
                  <h3>Participantes da sala</h3>
                  <p>As entradas serão atualizadas automaticamente.</p>
                </div>

                <div className="room-player-counter">
                  <strong>{roomPlayers.length}</strong>
                  <span>JOGADORES</span>
                </div>
              </div>

              {playersError && (
                <p className="room-error">{playersError}</p>
              )}

              {isLoadingPlayers ? (
                <p className="room-lobby-empty">
                  Carregando participantes...
                </p>
              ) : roomPlayers.length === 0 ? (
                <div className="room-lobby-empty">
                  <strong>Aguardando jogadores</strong>
                  <p>
                    Compartilhe o código da sala para que seus colegas
                    possam entrar.
                  </p>
                </div>
              ) : (
                <div className="room-player-list">
                  {roomPlayers.map((player, index) => (
                    <article className="room-player-item" key={player.id}>
                      <div className="room-player-avatar">
                        {player.player_name.charAt(0).toUpperCase()}
                      </div>

                      <div className="room-player-info">
                        <strong>{player.player_name}</strong>
                        <span>Participante {index + 1}</span>
                      </div>

                      <span
                        className={`room-player-status status-${player.player_status}`}
                      >
                        {getPlayerStatusLabel(player.player_status)}
                      </span>
                    </article>
                  ))}
                </div>
              )}

              {/* Controles para iniciar a partida. */}
              {!startedGame && (
                <div className="start-game-section">
                  <div className="start-game-status">
                    <strong>
                      {readyPlayersCount} de {roomPlayers.length} jogadores prontos
                    </strong>
                    <p>
                      {roomPlayers.length < 2
                        ? "A partida precisa de pelo menos dois jogadores."
                        : canStartGame
                          ? "Todos os participantes estão prontos para jogar."
                          : "Aguardando os demais participantes enviarem suas respostas."}
                    </p>
                  </div>

                  <button
                    className="button-primary start-game-button"
                    onClick={handleStartGame}
                    disabled={!canStartGame || isStartingGame}
                  >
                    {isStartingGame ? "INICIANDO PARTIDA..." : "INICIAR PARTIDA"}
                  </button>

                  {startGameError && (
                    <p className="room-error">{startGameError}</p>
                  )}
                </div>
              )}

              {/* Primeira pista exibida após o início. */}
              {startedGame && (
                <section className="started-game-panel">
                  <span className="created-room-label">PARTIDA INICIADA</span>
                  <h3>Rodada {startedGame.roundNumber}</h3>
                  <span className="started-game-question-label">
                    PERGUNTA {startedGame.questionNumber}
                  </span>

                  <div className="started-game-clue">
                    <span>PERGUNTA</span>
                    <p>{startedGame.clueQuestion}</p>
                  </div>

                  <div className="started-game-clue">
                    <span>RESPOSTA / PISTA</span>
                    <p>{startedGame.clueAnswer}</p>
                  </div>

                  <p className="started-game-note">
                    A identidade do participante permanece oculta até o momento
                    de revelação definido pelo anfitrião.
                  </p>
                </section>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

export default Host;
