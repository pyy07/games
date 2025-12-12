import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  TABLE_WIDTH, 
  TABLE_HEIGHT, 
  CUSHION_WIDTH,
  BALL_RADIUS, 
  POCKET_RADIUS, 
  COLORS, 
  BALL_COLORS,
  PHYSICS_CONFIG
} from '../constants';
import { 
  Ball, 
  BallType, 
  GameState, 
  Turn, 
  Vector2, 
  ChatMessage 
} from '../types';
import { 
  distance, 
  multiplyVector, 
  normalizeVector, 
  subtractVector, 
  checkCollision, 
  resolveCollision,
  magnitude,
  addVector
} from '../utils/physics';
import { generateCommentary } from '../services/geminiService';

const POCKETS: Vector2[] = [
  { x: CUSHION_WIDTH, y: CUSHION_WIDTH }, // Top Left
  { x: TABLE_WIDTH / 2, y: CUSHION_WIDTH }, // Top Middle
  { x: TABLE_WIDTH - CUSHION_WIDTH, y: CUSHION_WIDTH }, // Top Right
  { x: CUSHION_WIDTH, y: TABLE_HEIGHT - CUSHION_WIDTH }, // Bottom Left
  { x: TABLE_WIDTH / 2, y: TABLE_HEIGHT - CUSHION_WIDTH }, // Bottom Middle
  { x: TABLE_WIDTH - CUSHION_WIDTH, y: TABLE_HEIGHT - CUSHION_WIDTH }, // Bottom Right
];

// Helper to find a free spot for respawning balls (Foot Spot area)
const findFreeSpot = (balls: Ball[]): Vector2 => {
    let spot = { x: TABLE_WIDTH * 0.75, y: TABLE_HEIGHT / 2 };
    let safety = 0;
    while (balls.some(b => b.active && distance(b.position, spot) < BALL_RADIUS * 2) && safety < 100) {
        spot.x += BALL_RADIUS * 2 + 1; // Move towards foot rail
        if (spot.x > TABLE_WIDTH - CUSHION_WIDTH - BALL_RADIUS) {
            spot.x = TABLE_WIDTH * 0.75;
            spot.y += BALL_RADIUS * 2 + 1; // Move down if hit wall
        }
        safety++;
    }
    return spot;
};

const INITIAL_BALLS: Ball[] = (() => {
  const balls: Ball[] = [];
  // Cue ball
  balls.push({
    id: 0,
    type: BallType.CUE,
    position: { x: TABLE_WIDTH / 4, y: TABLE_HEIGHT / 2 },
    velocity: { x: 0, y: 0 },
    radius: BALL_RADIUS,
    color: BALL_COLORS[0],
    active: true,
    number: null,
  });

  // Rack setup (Triangle)
  const startX = TABLE_WIDTH * 0.75;
  const startY = TABLE_HEIGHT / 2;
  const rows = 5;
  
  let ballList: {id: number, type: BallType}[] = [];
  for(let i=1; i<=15; i++) {
    ballList.push({
      id: i,
      type: i === 8 ? BallType.EIGHT : (i < 8 ? BallType.SOLID : BallType.STRIPE)
    });
  }
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col <= row; col++) {
      const x = startX + row * (BALL_RADIUS * 2 * 0.866);
      const y = startY - (row * BALL_RADIUS) + (col * BALL_RADIUS * 2);
      
      let ballInfo;
      if (row === 2 && col === 1) {
          ballInfo = { id: 8, type: BallType.EIGHT };
      } else {
         ballInfo = ballList.find(b => b.id !== 8 && !balls.some(eb => eb.id === b.id));
      }
      
      if (ballInfo) {
          balls.push({
            id: ballInfo.id,
            type: ballInfo.type,
            position: { x, y },
            velocity: { x: 0, y: 0 },
            radius: BALL_RADIUS,
            color: BALL_COLORS[ballInfo.id],
            active: true,
            number: ballInfo.id,
          });
      }
    }
  }
  return balls;
})();

export const BilliardsGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [balls, setBalls] = useState<Ball[]>(JSON.parse(JSON.stringify(INITIAL_BALLS)));
  // Ref to access current balls state inside global event listeners without stale closures
  const ballsRef = useRef(balls); 
  const [gameState, setGameState] = useState<GameState>(GameState.AIMING);
  const [turn, setTurn] = useState<Turn>(Turn.PLAYER);
  const [dragStart, setDragStart] = useState<Vector2 | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Vector2 | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ sender: 'System', text: 'Welcome! Player vs Bot. 8-Ball Rules.' }]);
  const [winner, setWinner] = useState<string | null>(null);
  
  // Game Logic State
  const [playerGroup, setPlayerGroup] = useState<BallType.SOLID | BallType.STRIPE | null>(null);
  
  // Ref to track balls active at start of turn to determine what was pocketed
  const activeAtStartOfTurn = useRef<number[]>([]);

  // Sync ballsRef
  useEffect(() => {
    ballsRef.current = balls;
  }, [balls]);

  const addMessage = (sender: ChatMessage['sender'], text: string) => {
    setMessages(prev => [...prev.slice(-4), { sender, text }]); 
  };

  const getEventPos = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent): Vector2 => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    
    // Check for native or synthetic touch events
    // "changedTouches" covers both touchstart/move (where touches[0] works) and touchend (where only changedTouches has data)
    const touchList = (e as any).changedTouches || (e as any).touches;
    
    if (touchList && touchList.length > 0) {
        clientX = touchList[0].clientX;
        clientY = touchList[0].clientY;
    } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
    }
    
    const scaleX = TABLE_WIDTH / rect.width;
    const scaleY = TABLE_HEIGHT / rect.height;
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  // Robot Logic
  const executeRobotTurn = useCallback(async () => {
    if ((gameState !== GameState.AIMING && gameState !== GameState.PLACING) || turn !== Turn.ROBOT) return;
    
    // 1. Handle Ball in Hand Placement for Robot
    if (gameState === GameState.PLACING) {
        setBalls(prev => {
            const next = [...prev];
            const cue = next.find(b => b.id === 0);
            if (cue) {
                // Robot places ball randomly in the "kitchen" (left side) or random safe spot
                cue.position = { 
                    x: CUSHION_WIDTH + Math.random() * (TABLE_WIDTH * 0.25), 
                    y: CUSHION_WIDTH + Math.random() * (TABLE_HEIGHT - CUSHION_WIDTH * 2) 
                };
            }
            return next;
        });
        setGameState(GameState.AIMING);
        return; // Wait for next effect cycle to shoot
    }

    // 2. Aim and Shoot
    const cueBall = balls.find(b => b.type === BallType.CUE && b.active);
    if (!cueBall) return;

    // Identify target balls
    let validTargets: Ball[] = [];
    if (!playerGroup) {
        // Any solid or stripe is fine if open
        validTargets = balls.filter(b => b.active && (b.type === BallType.SOLID || b.type === BallType.STRIPE));
    } else {
        // Robot is opposite of player
        const robotGroup = playerGroup === BallType.SOLID ? BallType.STRIPE : BallType.SOLID;
        validTargets = balls.filter(b => b.active && b.type === robotGroup);
        // If group cleared, target 8-ball
        if (validTargets.length === 0 && balls.some(b => b.id === 8 && b.active)) {
             validTargets = balls.filter(b => b.id === 8);
        }
    }

    // Safety fallback
    if (validTargets.length === 0) validTargets = balls.filter(b => b.active && b.id !== 0);

    const target = validTargets[Math.floor(Math.random() * validTargets.length)];
    if (!target) return;

    const dx = target.position.x - cueBall.position.x;
    const dy = target.position.y - cueBall.position.y;
    // Add slight error to robot aim
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.05;

    const comment = await generateCommentary(`Robot targeting ${target.type} ${target.number}.`);
    addMessage('GeminiBot', comment);

    setTimeout(() => {
        const power = 12 + Math.random() * 3; 
        const velocity = {
            x: Math.cos(angle) * power,
            y: Math.sin(angle) * power
        };
        
        // SNAPSHOT for turn logic
        activeAtStartOfTurn.current = balls.filter(b => b.active).map(b => b.id);

        setBalls(prev => {
            const next = [...prev];
            const cue = next.find(b => b.id === 0);
            if (cue) cue.velocity = velocity;
            return next;
        });
        setGameState(GameState.MOVING);
    }, 1500);

  }, [balls, gameState, turn, playerGroup]);

  // Trigger Robot
  useEffect(() => {
    if (turn === Turn.ROBOT) {
        if (gameState === GameState.AIMING || gameState === GameState.PLACING) {
            executeRobotTurn();
        }
    }
  }, [turn, gameState, executeRobotTurn]);


  // Game Loop
  useEffect(() => {
    let animationFrameId: number;
    
    const loop = () => {
      if (gameState === GameState.MOVING) {
        setBalls(prevBalls => {
          const nextBalls = prevBalls.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } }));
          let isMoving = false;

          nextBalls.forEach(ball => {
            if (!ball.active) return;

            ball.position.x += ball.velocity.x;
            ball.position.y += ball.velocity.y;
            ball.velocity = multiplyVector(ball.velocity, PHYSICS_CONFIG.friction);

            if (magnitude(ball.velocity) < 0.05) {
              ball.velocity = { x: 0, y: 0 };
            } else {
              isMoving = true;
            }

            // Pockets
            for (const pocket of POCKETS) {
              if (distance(ball.position, pocket) < POCKET_RADIUS) {
                ball.active = false;
                ball.velocity = { x: 0, y: 0 }; 
                return;
              }
            }

            // Walls (Cushions)
            if (ball.position.x - ball.radius < CUSHION_WIDTH) {
              ball.position.x = CUSHION_WIDTH + ball.radius;
              ball.velocity.x *= -PHYSICS_CONFIG.wallBounciness;
            } else if (ball.position.x + ball.radius > TABLE_WIDTH - CUSHION_WIDTH) {
              ball.position.x = TABLE_WIDTH - CUSHION_WIDTH - ball.radius;
              ball.velocity.x *= -PHYSICS_CONFIG.wallBounciness;
            }

            if (ball.position.y - ball.radius < CUSHION_WIDTH) {
              ball.position.y = CUSHION_WIDTH + ball.radius;
              ball.velocity.y *= -PHYSICS_CONFIG.wallBounciness;
            } else if (ball.position.y + ball.radius > TABLE_HEIGHT - CUSHION_WIDTH) {
              ball.position.y = TABLE_HEIGHT - CUSHION_WIDTH - ball.radius;
              ball.velocity.y *= -PHYSICS_CONFIG.wallBounciness;
            }
          });

          // Collisions
          for (let i = 0; i < nextBalls.length; i++) {
            for (let j = i + 1; j < nextBalls.length; j++) {
              if (checkCollision(nextBalls[i], nextBalls[j])) {
                resolveCollision(nextBalls[i], nextBalls[j]);
              }
            }
          }
          
          return nextBalls;
        });
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);


  // Turn End Logic
  const processTurnResult = useCallback(() => {
    const pocketedIds = activeAtStartOfTurn.current.filter(id => {
        const ball = balls.find(b => b.id === id);
        return ball && !ball.active;
    });

    const cueBallPocketed = pocketedIds.includes(0);
    const eightBallPocketed = pocketedIds.includes(8);
    const otherPocketedIds = pocketedIds.filter(id => id !== 0 && id !== 8);
    
    let nextTurn = turn;
    let nextState = GameState.AIMING;
    let nextBalls = [...balls];
    let gameOver = false;
    let winMsg = "";
    
    // Determine Groups if not set
    let newPlayerGroup = playerGroup;
    if (!playerGroup && otherPocketedIds.length > 0 && !cueBallPocketed) {
        const firstBall = balls.find(b => b.id === otherPocketedIds[0]);
        if (firstBall) {
            // If Player shot, they get the group of the first ball.
            // If Robot shot, Player gets the opposite.
            const type = firstBall.type === BallType.SOLID ? BallType.SOLID : BallType.STRIPE;
            newPlayerGroup = turn === Turn.PLAYER ? type : (type === BallType.SOLID ? BallType.STRIPE : BallType.SOLID);
            setPlayerGroup(newPlayerGroup);
            addMessage('System', `${turn === Turn.PLAYER ? 'You are' : 'Robot is'} ${type}s.`);
        }
    }

    // Determine current shooter's target group
    let currentShooterGroup: BallType | null = null;
    if (newPlayerGroup) {
        currentShooterGroup = turn === Turn.PLAYER ? newPlayerGroup : (newPlayerGroup === BallType.SOLID ? BallType.STRIPE : BallType.SOLID);
    }

    // --- RULE ENFORCEMENT ---

    // 1. 8-Ball Logic
    if (eightBallPocketed) {
        if (cueBallPocketed) {
            // Scratch + 8-ball = Loss
            gameOver = true;
            winMsg = turn === Turn.PLAYER ? "Robot" : "Player"; // Opponent wins
        } else {
            // Check if group is cleared
            const shooterBallsRemaining = activeAtStartOfTurn.current.some(id => {
                const b = balls.find(ball => ball.id === id);
                return b && b.type === currentShooterGroup && id !== 8;
            });

            if (!currentShooterGroup || shooterBallsRemaining) {
                 // Early 8-ball = Loss
                 gameOver = true;
                 winMsg = turn === Turn.PLAYER ? "Robot" : "Player";
            } else {
                 // Legal 8-ball = Win
                 gameOver = true;
                 winMsg = turn === Turn.PLAYER ? "Player" : "Robot";
            }
        }
    }

    // 2. Scratch Logic
    else if (cueBallPocketed) {
        addMessage('System', 'Scratch! Ball in Hand.');
        nextTurn = turn === Turn.PLAYER ? Turn.ROBOT : Turn.PLAYER;
        nextState = GameState.PLACING;
        
        // Reset Cue Ball
        const cue = nextBalls.find(b => b.id === 0);
        if (cue) {
            cue.active = true;
            cue.velocity = {x: 0, y: 0};
            cue.position = {x: TABLE_WIDTH/4, y: TABLE_HEIGHT/2}; // Default, will be moved in PLACING
        }
    }

    // 3. Normal Shot Logic
    else {
        const myBallsPocketed = otherPocketedIds.filter(id => {
            const b = balls.find(x => x.id === id);
            return !currentShooterGroup || (b && b.type === currentShooterGroup);
        });

        const opponentBallsPocketed = otherPocketedIds.filter(id => {
            const b = balls.find(x => x.id === id);
            return currentShooterGroup && (b && b.type !== currentShooterGroup);
        });

        // Handle Respawns for opponent balls ("Wrong ball pocketed" rule)
        if (opponentBallsPocketed.length > 0) {
            addMessage('System', 'Opponent ball pocketed! Returning to table.');
            opponentBallsPocketed.forEach(id => {
                const b = nextBalls.find(x => x.id === id);
                if (b) {
                    b.active = true;
                    b.velocity = {x: 0, y: 0};
                    b.position = findFreeSpot(nextBalls);
                }
            });
        }

        // Turn switching
        if (myBallsPocketed.length > 0 && opponentBallsPocketed.length === 0) {
            // Good shot, keep turn
            nextTurn = turn;
            addMessage(turn === Turn.PLAYER ? 'You' : 'GeminiBot', 'Nice shot! Go again.');
        } else {
            // Missed or fouled (pocketed opponent ball)
            nextTurn = turn === Turn.PLAYER ? Turn.ROBOT : Turn.PLAYER;
        }
    }

    if (gameOver) {
        setWinner(winMsg);
        setGameState(GameState.GAME_OVER);
    } else {
        setBalls(nextBalls);
        setTurn(nextTurn);
        setGameState(nextState);
    }
  }, [balls, playerGroup, turn]);


  // Monitor movement to trigger Turn End
  useEffect(() => {
    if (gameState === GameState.MOVING) {
        const isAnyMoving = balls.some(b => magnitude(b.velocity) > 0);
        if (!isAnyMoving) {
            processTurnResult();
        }
    }
  }, [balls, gameState, processTurnResult]);

  // Global Event Listeners for Dragging outside canvas
  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent | TouchEvent) => {
        const pos = getEventPos(e);
        if (gameState === GameState.PLACING && turn === Turn.PLAYER) {
             setBalls(prev => {
                const next = [...prev];
                const cue = next.find(b => b.id === 0);
                if (cue) {
                    cue.position.x = Math.max(CUSHION_WIDTH + BALL_RADIUS, Math.min(pos.x, TABLE_WIDTH - CUSHION_WIDTH - BALL_RADIUS));
                    cue.position.y = Math.max(CUSHION_WIDTH + BALL_RADIUS, Math.min(pos.y, TABLE_HEIGHT - CUSHION_WIDTH - BALL_RADIUS));
                }
                return next;
            });
        } else if (dragStart) {
             setDragCurrent(pos);
        }
    };

    const handleWindowMouseUp = (e: MouseEvent | TouchEvent) => {
        if (gameState === GameState.PLACING && turn === Turn.PLAYER) {
             // Placing confirm
             setGameState(GameState.AIMING);
             addMessage('System', 'Ball placed.');
        } else if (dragStart) {
             // Shooting confirm
             const pos = getEventPos(e);
             const dragVector = subtractVector(dragStart, pos);
             const rawPower = magnitude(dragVector) / 5;

             if (rawPower > 1) {
                const power = Math.min(rawPower, PHYSICS_CONFIG.maxPower);
                const direction = normalizeVector(dragVector);
                const velocity = multiplyVector(direction, power);

                // Use ref to get current balls for snapshot without dependency
                activeAtStartOfTurn.current = ballsRef.current.filter(b => b.active).map(b => b.id);

                setBalls(prev => {
                    const next = [...prev];
                    const cue = next.find(b => b.id === 0);
                    if (cue) cue.velocity = velocity;
                    return next;
                });
                setGameState(GameState.MOVING);
                addMessage('You', 'Shot fired!');
             }
             setDragStart(null);
             setDragCurrent(null);
        }
    };

    // Attach only when interacting
    if (dragStart || (gameState === GameState.PLACING && turn === Turn.PLAYER)) {
        window.addEventListener('mousemove', handleWindowMouseMove);
        window.addEventListener('mouseup', handleWindowMouseUp);
        window.addEventListener('touchmove', handleWindowMouseMove, { passive: false });
        window.addEventListener('touchend', handleWindowMouseUp);
    }

    return () => {
        window.removeEventListener('mousemove', handleWindowMouseMove);
        window.removeEventListener('mouseup', handleWindowMouseUp);
        window.removeEventListener('touchmove', handleWindowMouseMove);
        window.removeEventListener('touchend', handleWindowMouseUp);
    };
  }, [dragStart, gameState, turn]);


  // Mouse Handlers (Canvas triggers start)
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pos = getEventPos(e);

    // PLACING BALL IN HAND (Player Logic)
    if (gameState === GameState.PLACING && turn === Turn.PLAYER) {
        return; // Interaction handled by global listeners now
    }

    // AIMING
    if (gameState === GameState.AIMING && turn === Turn.PLAYER) {
        const cueBall = balls.find(b => b.id === 0);
        if (cueBall && distance(pos, cueBall.position) < 100) { 
            setDragStart(pos);
            setDragCurrent(pos);
        }
    }
  };

  // RENDERING
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);

    // Border
    ctx.fillStyle = COLORS.TABLE_BORDER;
    ctx.fillRect(0, 0, TABLE_WIDTH, TABLE_HEIGHT);
    
    // Felt
    ctx.fillStyle = COLORS.TABLE_FELT;
    ctx.fillRect(
      CUSHION_WIDTH, 
      CUSHION_WIDTH, 
      TABLE_WIDTH - CUSHION_WIDTH * 2, 
      TABLE_HEIGHT - CUSHION_WIDTH * 2
    );

    // Pockets
    ctx.fillStyle = COLORS.POCKET;
    POCKETS.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });

    // Balls
    balls.forEach(ball => {
      if (!ball.active) return;
      
      // Shadow
      ctx.beginPath();
      ctx.arc(ball.position.x + 2, ball.position.y + 2, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      // Ball
      ctx.beginPath();
      ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = ball.color;
      ctx.fill();

      if (ball.type === BallType.STRIPE) {
         ctx.beginPath();
         ctx.arc(ball.position.x, ball.position.y, ball.radius * 0.9, 0, Math.PI * 2);
         ctx.fillStyle = '#ffffff';
         ctx.fill();
         
         ctx.fillStyle = ball.color;
         ctx.fillRect(ball.position.x - ball.radius, ball.position.y - 5, ball.radius * 2, 10);
      }

      if (ball.number !== null) {
          ctx.beginPath();
          ctx.arc(ball.position.x, ball.position.y, ball.radius * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          
          ctx.fillStyle = 'black';
          ctx.font = '10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(ball.number.toString(), ball.position.x, ball.position.y);
      }
    });

    // Cue Stick / Guide
    if (gameState === GameState.AIMING && turn === Turn.PLAYER && dragStart && dragCurrent) {
        const cueBall = balls.find(b => b.id === 0);
        if (cueBall && cueBall.active) {
            ctx.beginPath();
            ctx.moveTo(cueBall.position.x, cueBall.position.y);
            
            const dragVector = subtractVector(dragStart, dragCurrent);
            const aimEnd = addVector(cueBall.position, multiplyVector(dragVector, 3));
            
            ctx.lineTo(aimEnd.x, aimEnd.y);
            ctx.strokeStyle = COLORS.GUIDE_LINE;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            const angle = Math.atan2(dragVector.y, dragVector.x);
            
            ctx.save();
            ctx.translate(cueBall.position.x, cueBall.position.y);
            ctx.rotate(angle + Math.PI); 
            
            const power = Math.min(magnitude(dragVector) / 5, PHYSICS_CONFIG.maxPower);
            const pullBack = power * 5; 
            
            ctx.fillStyle = COLORS.CUE_STICK;
            ctx.fillRect(15 + pullBack, -3, 200, 6);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(15 + pullBack, -3, 10, 6); 
            
            ctx.restore();
        }
    }

    // Ball in Hand Highlight
    if (gameState === GameState.PLACING && turn === Turn.PLAYER) {
        const cueBall = balls.find(b => b.id === 0);
        if (cueBall) {
            ctx.beginPath();
            ctx.arc(cueBall.position.x, cueBall.position.y, BALL_RADIUS + 5, 0, Math.PI * 2);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.font = '16px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.fillText("Click to Place Cue Ball", TABLE_WIDTH/2, TABLE_HEIGHT - 50);
        }
    }

  }, [balls, dragStart, dragCurrent, gameState, turn]);

  return (
    <div className="game-wrapper">
        <div className="status-bar">
            <div className={`player-active ${turn === Turn.PLAYER ? '' : 'text-muted'}`}>
                You {turn === Turn.PLAYER && '●'} 
                {playerGroup && <span style={{fontSize:'0.8em', marginLeft:'5px'}}>({playerGroup})</span>}
            </div>
            <div style={{textAlign: 'center', color: '#cbd5e1'}}>
                {winner ? `WINNER: ${winner.toUpperCase()}` : 
                 gameState === GameState.MOVING ? 'Balls Rolling...' : 
                 gameState === GameState.PLACING ? 'Ball in Hand' : 'Aiming...'}
            </div>
            <div className={`robot-active ${turn === Turn.ROBOT ? '' : 'text-muted'}`}>
                Bot {turn === Turn.ROBOT && '●'}
                {playerGroup && <span style={{fontSize:'0.8em', marginLeft:'5px'}}>
                    ({playerGroup === BallType.SOLID ? BallType.STRIPE : BallType.SOLID})
                </span>}
            </div>
        </div>

        <div className="canvas-container">
            <canvas
                ref={canvasRef}
                width={TABLE_WIDTH}
                height={TABLE_HEIGHT}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
            />
             {winner && (
                <div className="overlay">
                    <h2 style={{fontSize: '2rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem'}}>{winner} WINS!</h2>
                    <button 
                        onClick={() => window.location.reload()}
                        className="btn-primary"
                    >
                        Play Again
                    </button>
                </div>
            )}
        </div>

        <div className="chat-box">
            <div className="chat-label">Live Commentary</div>
            {messages.map((msg, idx) => (
                <div key={idx} className={`message-row ${msg.sender === 'You' ? 'right' : ''}`}>
                    <div className={`avatar ${msg.sender === 'GeminiBot' ? 'bot' : msg.sender === 'You' ? 'you' : 'sys'}`}>
                        {msg.sender === 'GeminiBot' ? 'BOT' : msg.sender === 'You' ? 'YOU' : 'SYS'}
                    </div>
                    <div className={`bubble ${msg.sender === 'GeminiBot' ? 'bot' : msg.sender === 'You' ? 'you' : 'sys'}`}>
                        {msg.text}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};