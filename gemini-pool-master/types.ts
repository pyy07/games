export interface Vector2 {
  x: number;
  y: number;
}

export enum BallType {
  CUE = 'CUE',
  SOLID = 'SOLID',
  STRIPE = 'STRIPE',
  EIGHT = 'EIGHT',
}

export interface Ball {
  id: number;
  type: BallType;
  position: Vector2;
  velocity: Vector2;
  radius: number;
  color: string;
  active: boolean; // false if pocketed
  number: number | null;
}

export enum GameState {
  AIMING = 'AIMING',
  MOVING = 'MOVING',
  PLACING = 'PLACING', // Ball in hand placement
  GAME_OVER = 'GAME_OVER',
}

export enum Turn {
  PLAYER = 'PLAYER',
  ROBOT = 'ROBOT',
}

export interface ChatMessage {
  sender: 'System' | 'You' | 'GeminiBot';
  text: string;
}

export interface GameConfig {
  friction: number;
  wallBounciness: number;
  ballBounciness: number;
  maxPower: number;
}