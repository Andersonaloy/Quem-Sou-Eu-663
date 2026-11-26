// Informações básicas necessárias para manter a navegação do jogador.
export type PlayerRoomData = {
  roomId: string;
  roomCode: string;
  playerId: string;
  playerName: string;
};

// Informações básicas da sala para a área do anfitrião.
export type HostRoomData = {
  id: string;
  code: string;
};

export function getPlayerRoomData(value: unknown): PlayerRoomData | null {
  if (value && typeof value === "object") {
    const data = value as Partial<PlayerRoomData>;
    if (data.roomId && data.roomCode && data.playerId && data.playerName) {
      return data as PlayerRoomData;
    }
  }

  try {
    const saved = sessionStorage.getItem("playerRoomData");
    if (!saved) return null;

    const data = JSON.parse(saved) as Partial<PlayerRoomData>;
    if (data.roomId && data.roomCode && data.playerId && data.playerName) {
      return data as PlayerRoomData;
    }
  } catch (error) {
    console.error("Não foi possível recuperar os dados do jogador:", error);
  }

  return null;
}

export function getHostRoomData(value: unknown): HostRoomData | null {
  if (value && typeof value === "object") {
    const data = value as {
      roomId?: string;
      roomCode?: string;
      id?: string;
      code?: string;
    };
    if (data.roomId && data.roomCode) {
      return { id: data.roomId, code: data.roomCode };
    }
    if (data.id && data.code) {
      return { id: data.id, code: data.code };
    }
  }

  try {
    const saved = sessionStorage.getItem("hostRoomData");
    if (!saved) return null;

    const data = JSON.parse(saved) as Partial<HostRoomData>;
    if (data.id && data.code) return data as HostRoomData;
  } catch (error) {
    console.error("Não foi possível recuperar os dados da sala:", error);
  }

  return null;
}
