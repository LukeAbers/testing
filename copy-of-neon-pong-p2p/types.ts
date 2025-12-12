
export enum UiState {
  Menu,
  Hosting,
  Joining,
  Playing,
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Paddle {
  y: number;
  score: number;
}

export interface GameState {
  ball: Ball;
  p1: Paddle; // Host (Left)
  p2: Paddle; // Client (Right)
}

// Network packet for full game state update from host
export interface GameUpdatePacket {
  t: 'u'; // type: update
  b: Ball;
  p1y: number;
  s1: number;
  s2: number;
}

// Network packet for client paddle movement
export interface PaddleMovePacket {
  t: 'p'; // type: paddle
  y: number;
}

// Network packet for sending a single video frame
export interface VideoFramePacket {
  t: 'v'; // type: video-frame
  d: string; // data: base64 encoded JPEG
}

export type DataPacket = GameUpdatePacket | PaddleMovePacket | VideoFramePacket;
