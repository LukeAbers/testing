
import type { GameState } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

export const PADDLE_HEIGHT = 100;
export const PADDLE_WIDTH = 15;
export const BALL_SIZE = 10;

export const INITIAL_GAME_STATE: GameState = {
  ball: {
    x: CANVAS_WIDTH / 2,
    y: CANVAS_HEIGHT / 2,
    vx: 6,
    vy: 4,
  },
  p1: {
    y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    score: 0,
  },
  p2: {
    y: CANVAS_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    score: 0,
  },
};
