
import React from 'react';
import type { GameState, DataPacket, GameUpdatePacket, PaddleMovePacket } from './types';
import { UiState } from './types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PADDLE_HEIGHT, PADDLE_WIDTH, BALL_SIZE, INITIAL_GAME_STATE } from './constants';

// Since PeerJS is loaded from a script tag, we need to declare it for TypeScript
declare const Peer: any;

const PEERJS_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ],
    sdpSemantics: 'unified-plan'
  }
};

interface GameCanvasProps {
  gameState: GameState;
  canvasRef: React.RefObject<HTMLCanvasElement>;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ gameState, canvasRef }) => {
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Net
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 10]);
    ctx.beginPath();
    ctx.moveTo(CANVAS_WIDTH / 2, 0);
    ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Paddles
    ctx.fillStyle = '#10b981';
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 15;
    ctx.fillRect(0, gameState.p1.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillRect(CANVAS_WIDTH - PADDLE_WIDTH, gameState.p2.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(gameState.ball.x, gameState.ball.y, BALL_SIZE, 0, Math.PI * 2);
    ctx.fill();

    // Reset shadow for text
    ctx.shadowBlur = 0;

    // Scores
    ctx.font = "60px 'Courier New', Courier, monospace";
    ctx.fillStyle = '#10b981';
    ctx.textAlign = 'center';
    ctx.fillText(String(gameState.p1.score), CANVAS_WIDTH / 4, 70);
    ctx.fillText(String(gameState.p2.score), (CANVAS_WIDTH / 4) * 3, 70);

  }, [gameState, canvasRef]);

  return <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} className="w-full h-full" />;
};


export default function App() {
  const [uiState, setUiState] = React.useState<UiState>(UiState.Menu);
  const [gameCode, setGameCode] = React.useState('');
  const [joinCode, setJoinCode] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [gameState, setGameState] = React.useState<GameState>(INITIAL_GAME_STATE);
  const [friendFrame, setFriendFrame] = React.useState<string | null>(null);

  const peerRef = React.useRef<any>(null);
  const connRef = React.useRef<any>(null);
  const isHostRef = React.useRef(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const animationFrameId = React.useRef<number>();
  const lastGameState = React.useRef<GameState>(INITIAL_GAME_STATE);
  
  const myVideoRef = React.useRef<HTMLVideoElement>(null);
  const myStreamRef = React.useRef<MediaStream | null>(null);
  const frameSenderIntervalRef = React.useRef<number>();

  const stopMediaStream = React.useCallback(() => {
    myStreamRef.current?.getTracks().forEach(track => track.stop());
    myStreamRef.current = null;
    if (myVideoRef.current) myVideoRef.current.srcObject = null;
  }, []);

  const resetBall = React.useCallback((forP1Score: boolean) => {
    lastGameState.current.ball = {
      ...INITIAL_GAME_STATE.ball,
      vx: (forP1Score ? -1 : 1) * 6,
      vy: (Math.random() * 6 - 3),
    };
  }, []);

  const gameLoop = React.useCallback(() => {
    let { ball, p1, p2 } = lastGameState.current;
    
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.y - BALL_SIZE < 0 || ball.y + BALL_SIZE > CANVAS_HEIGHT) {
        ball.vy = -ball.vy;
        ball.y = Math.max(BALL_SIZE, Math.min(ball.y, CANVAS_HEIGHT - BALL_SIZE));
    }

    if (isHostRef.current) {
        if (ball.vx < 0 && ball.x - BALL_SIZE < PADDLE_WIDTH && ball.y > p1.y && ball.y < p1.y + PADDLE_HEIGHT) {
             ball.vx = -ball.vx * 1.05;
             ball.vy += (ball.y - (p1.y + PADDLE_HEIGHT / 2)) * 0.1;
             ball.x = PADDLE_WIDTH + BALL_SIZE;
        }
        if (ball.vx > 0 && ball.x + BALL_SIZE > CANVAS_WIDTH - PADDLE_WIDTH && ball.y > p2.y && ball.y < p2.y + PADDLE_HEIGHT) {
            ball.vx = -ball.vx * 1.05;
            ball.vy += (ball.y - (p2.y + PADDLE_HEIGHT / 2)) * 0.1;
            ball.x = CANVAS_WIDTH - PADDLE_WIDTH - BALL_SIZE;
        }

        if (ball.x < 0) { p2.score++; resetBall(false); }
        if (ball.x > CANVAS_WIDTH) { p1.score++; resetBall(true); }

        const packet: GameUpdatePacket = { t: 'u', b: ball, p1y: p1.y, s1: p1.score, s2: p2.score };
        if (connRef.current?.open) connRef.current.send(packet);
    } else {
        const packet: PaddleMovePacket = { t: 'p', y: lastGameState.current.p2.y };
        if (connRef.current?.open) connRef.current.send(packet);
    }

    setGameState(JSON.parse(JSON.stringify(lastGameState.current)));
    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, [resetBall]);
  
  const startGame = React.useCallback(() => {
    setUiState(UiState.Playing);
    resetBall(true);
    lastGameState.current = JSON.parse(JSON.stringify(INITIAL_GAME_STATE));
    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, [gameLoop, resetBall]);
  
  const startMedia = React.useCallback(async () => {
    const mediaConstraints = {
      audio: false, // Audio is not supported with this data channel method
      video: {
        facingMode: "user",
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 15 }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
      myStreamRef.current = stream;
      if (myVideoRef.current) {
        myVideoRef.current.srcObject = stream;
        myVideoRef.current.oncanplay = () => {
           // Set the capture canvas size once the video metadata is loaded
          if (captureCanvasRef.current && myVideoRef.current) {
            captureCanvasRef.current.width = myVideoRef.current.videoWidth;
            captureCanvasRef.current.height = myVideoRef.current.videoHeight;
          }
        }
      }
      return stream;
    } catch (err) {
      console.error('Failed to get local stream', err);
      setStatus('Camera access denied. Please allow and refresh.');
      setUiState(UiState.Menu);
      throw err;
    }
  }, [setStatus, setUiState]);

  const refreshMedia = React.useCallback(async () => {
    try {
        myStreamRef.current?.getTracks().forEach(track => track.stop());
        await startMedia();
    } catch (error) {
        console.error("Failed to refresh media:", error);
        setStatus("Could not refresh camera.");
    }
  }, [startMedia]);
  
  const setupDataListener = React.useCallback((c: any) => {
    c.on('data', (data: DataPacket) => {
        switch(data.t) {
            case 'p':
                if (isHostRef.current) lastGameState.current.p2.y = data.y;
                break;
            case 'u':
                if (!isHostRef.current) {
                    const { b, p1y, s1, s2 } = data;
                    lastGameState.current.ball = b;
                    lastGameState.current.p1 = { y: p1y, score: s1 };
                    lastGameState.current.p2.score = s2;
                }
                break;
            case 'v':
                setFriendFrame(data.d);
                break;
        }
    });

    c.on('close', () => {
      setStatus('Friend disconnected.');
      setUiState(UiState.Menu);
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (frameSenderIntervalRef.current) clearInterval(frameSenderIntervalRef.current);
      stopMediaStream();
    });
  }, [stopMediaStream, startGame]);

  const setupConnection = (c: any) => {
    connRef.current = c;
    setStatus('Friend connected! Starting game...');
    setupDataListener(c);

    // Start sending video frames
    frameSenderIntervalRef.current = setInterval(() => {
        const video = myVideoRef.current;
        const canvas = captureCanvasRef.current;
        if (video && canvas && connRef.current?.open) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameData = canvas.toDataURL('image/jpeg', 0.3); // Low quality for performance
                connRef.current.send({ t: 'v', d: frameData });
            }
        }
    }, 1000 / 15); // ~15 FPS

    setTimeout(startGame, 1500);
  };

  const createGame = async () => {
    setUiState(UiState.Hosting);
    setStatus('Starting camera...');
    
    try {
      await startMedia();
      const code = String(Math.floor(1000 + Math.random() * 9000));
      setGameCode(code);
      setStatus('Waiting for friend...');
      isHostRef.current = true;

      const peer = new Peer('neon-pong-' + code, PEERJS_CONFIG);
      peerRef.current = peer;
      
      peer.on('open', (id: string) => console.log('My Peer ID is: ' + id));
      peer.on('connection', setupConnection);
      peer.on('error', (err: any) => {
          setStatus(`Error: ${err.message}. Please refresh.`);
          console.error(err);
      });
    } catch (error) {
      console.error("Could not start game due to media error.", error);
    }
  };

  const connectToGame = async () => {
    if (!joinCode || joinCode.length !== 4) {
      setStatus('Please enter a valid 4-digit code.');
      return;
    }
    setStatus('Starting camera...');
    
    try {
      await startMedia();
      setStatus('Connecting...');
      isHostRef.current = false;

      const peer = new Peer(undefined, PEERJS_CONFIG);
      peerRef.current = peer;

      peer.on('open', () => {
        const c = peer.connect('neon-pong-' + joinCode);
        c.on('open', () => setupConnection(c));
      });

      peer.on('error', (err: any) => {
          setStatus(`Error: ${err.message}. Check code or refresh.`);
          console.error(err);
      });
    } catch (error) {
      console.error("Could not join game due to media error.", error);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (uiState !== UiState.Playing || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = CANVAS_HEIGHT / rect.height;
    let gameY = (e.clientY - rect.top) * scale - (PADDLE_HEIGHT / 2);
    gameY = Math.max(0, Math.min(gameY, CANVAS_HEIGHT - PADDLE_HEIGHT));

    if (isHostRef.current) { lastGameState.current.p1.y = gameY; } 
    else { lastGameState.current.p2.y = gameY; }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (uiState !== UiState.Playing || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = CANVAS_HEIGHT / rect.height;
    let gameY = (e.touches[0].clientY - rect.top) * scale - (PADDLE_HEIGHT / 2);
    gameY = Math.max(0, Math.min(gameY, CANVAS_HEIGHT - PADDLE_HEIGHT));
    
    if (isHostRef.current) { lastGameState.current.p1.y = gameY; } 
    else { lastGameState.current.p2.y = gameY; }
  };

  // Cleanup effect
  React.useEffect(() => {
    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
      if (frameSenderIntervalRef.current) clearInterval(frameSenderIntervalRef.current);
      stopMediaStream();
      connRef.current?.close();
      peerRef.current?.destroy();
    };
  }, [stopMediaStream]);
  
  const renderUI = () => {
    if (uiState === UiState.Playing) return null;

    return (
      <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-10 p-4 text-center">
        <h1 className="text-5xl md:text-7xl font-bold mb-8 text-emerald-400 text-glow">NEON PONG</h1>
        
        {uiState === UiState.Menu && (
          <div className="flex flex-col items-center">
            <button onClick={createGame} className="bg-emerald-500 text-black font-bold py-4 px-8 text-2xl hover:bg-emerald-400 transition-colors mb-4 w-64">Create Game</button>
            <p className="text-emerald-200 my-2">- OR -</p>
            <button onClick={() => setUiState(UiState.Joining)} className="bg-emerald-500 text-black font-bold py-4 px-8 text-2xl hover:bg-emerald-400 transition-colors mt-4 w-64">Join Game</button>
          </div>
        )}

        {uiState === UiState.Hosting && (
          <div className="flex flex-col items-center">
            {gameCode ? (
              <>
                <p className="text-xl text-emerald-200">Your Game Code:</p>
                <div className="text-5xl font-mono border-2 border-dashed border-white text-white p-4 my-4 tracking-widest">{gameCode}</div>
                <p className="text-xl text-emerald-200">Send this to your friend!</p>
              </>
            ) : null}
            <p className="text-yellow-400 mt-6 text-lg flicker">{status}</p>
          </div>
        )}

        {uiState === UiState.Joining && (
          <div className="flex flex-col items-center w-full max-w-sm">
            <input 
              type="text" 
              maxLength={4}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="Enter 4-Digit Code"
              className="bg-black border-2 border-emerald-400 text-emerald-400 text-3xl p-3 text-center font-mono w-full tracking-[.2em]"
            />
            <button onClick={connectToGame} className="bg-emerald-500 text-black font-bold py-3 px-8 text-2xl hover:bg-emerald-400 transition-colors mt-6 w-full">Connect</button>
            {status && <p className="text-yellow-400 mt-6 text-lg">{status}</p>}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="bg-black text-green-400 font-mono flex flex-col items-center justify-center min-h-screen p-2 md:p-4 touch-none">
      <canvas ref={captureCanvasRef} style={{ display: 'none' }} />
      <div 
        id="game-container" 
        className="relative border-4 border-emerald-800 shadow-[0_0_20px_#059669] w-full max-w-5xl aspect-[4/3]"
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
      >
        <GameCanvas gameState={gameState} canvasRef={canvasRef} />
        {renderUI()}
        <div 
            className="absolute top-2 left-2 w-[22%] rounded-md z-20 transition-opacity duration-500"
            style={{ opacity: uiState === UiState.Playing ? 1 : 0}}
        >
            <video ref={myVideoRef} muted autoPlay playsInline className="w-full h-full object-cover rounded-md border-2 border-emerald-600 shadow-[0_0_10px_#059669]" style={{ transform: 'scaleX(-1)' }} />
            <button
                onClick={refreshMedia}
                title="Refresh Camera"
                className="absolute top-1 right-1 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center border border-emerald-700 text-emerald-400 hover:bg-emerald-800/80 transition-colors"
                aria-label="Refresh Camera"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 11.667 0c3.221-3.221 3.221-8.456 0-11.667l-3.182-3.182m0 0-4.992 4.992" />
                </svg>
            </button>
        </div>
        <div 
            className="absolute top-2 right-2 w-[22%] rounded-md z-20 transition-all duration-500 border-2 shadow-[0_0_10px_#059669] border-emerald-600 bg-black"
            style={{ opacity: uiState === UiState.Playing ? 1 : 0}}
        >
            {friendFrame ? (
              <img src={friendFrame} alt="Friend's video feed" className="w-full h-full object-cover rounded-md" style={{ transform: 'scaleX(-1)' }}/>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-emerald-400 text-sm">Connecting...</div>
            )}
        </div>
      </div>
    </div>
  );
}
