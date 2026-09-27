
export enum GameState {
  LOBBY_SELECT = 'LOBBY_SELECT',
  LOBBY_HOST = 'LOBBY_HOST',
  LOBBY_JOIN = 'LOBBY_JOIN',
  REGISTRATION = 'REGISTRATION',
  PLACEMENT = 'PLACEMENT',
  TRANSITION = 'TRANSITION', 
  PLAYER_TURN = 'PLAYER_TURN',
  RESOLUTION = 'RESOLUTION',
  GAME_OVER = 'GAME_OVER'
}

export enum CellType {
  EMPTY = 0,
  SHIP = 1,
  HIT = 2,
  BLOCKED = 3,
  MISS = 4
}

export interface Coordinate {
  x: number;
  y: number;
}

export interface Player {
  teamName: string;
  cipher: string;
  board: number[][];
  opponentPerspectiveBoard: number[][];
  points: number;
  shipsLeft: number;
}

export interface Message {
  sender: string;
  text: string;
  timestamp: string;
  isEncrypted: boolean;
}

export interface PendingTurn {
  attack: Coordinate | null;
  defend: Coordinate | null;
}
