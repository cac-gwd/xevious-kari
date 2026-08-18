"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SCREEN_WIDTH = 250;
const SCREEN_HEIGHT = 300;
const PLAYER_SPEED = 2;
const MAX_PLAYER_SHOTS = 3;

type Point = { x: number; y: number };
type EnemyKind = 1 | 2 | 3 | 20 | 21;

type MovingShot = Point & {
  vx: number;
  vy: number;
};

type Enemy = Point & {
  kind: EnemyKind;
  phase: number;
  sprite: HTMLImageElement;
};

type Blast = Point & { radius: number };

type GameState = {
  running: boolean;
  paused: boolean;
  alive: boolean;
  player: Point;
  playerShots: Point[];
  enemyShots: MovingShot[];
  enemies: Enemy[];
  score: number;
  highScore: number;
  bombs: number;
  chain: number;
  wave: number;
  spawnTimer: number;
  blast: Blast | null;
};

const initialGameState = (): GameState => ({
  running: false,
  paused: false,
  alive: true,
  player: { x: 105, y: 245 },
  playerShots: [],
  enemyShots: [],
  enemies: [],
  score: 0,
  highScore: 0,
  bombs: 1,
  chain: 0,
  wave: 0,
  spawnTimer: 40,
  blast: null,
});

const objectsOverlap = (a: Point, b: Point, radius = 15) =>
  Math.abs(a.x - b.x) < radius && Math.abs(a.y - b.y) < radius;

const getDifficulty = (wave: number) =>
  Math.min(5, 1 + Math.floor(wave / 10));

const chooseEnemyKind = (wave: number): EnemyKind => {
  if (wave % 24 === 23) return 21; // 強化cube
  if (wave % 12 === 11) return 20; // 通常cube
  return ((wave % 3) + 1) as 1 | 2 | 3;
};

const getSpriteName = (kind: EnemyKind) => {
  if (kind >= 20) return "cube";
  if (kind === 1) return "fel";
  if (kind === 2) return "melanza";
  return "espa";
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pressedKeys = useRef(new Set<string>());
  const images = useRef<Record<string, HTMLImageElement>>({});
  const game = useRef<GameState>(initialGameState());
  const [status, setStatus] = useState("READY");

  const resetGame = useCallback(() => {
    const highScore = game.current.highScore;
    game.current = {
      ...initialGameState(),
      running: true,
      spawnTimer: 35,
      highScore,
    };
    setStatus("PLAYING");
    canvasRef.current?.focus();
  }, []);

  const firePlayerShot = useCallback(() => {
    const state = game.current;
    if (
      !state.running ||
      !state.alive ||
      state.paused ||
      state.playerShots.length >= MAX_PLAYER_SHOTS
    ) {
      return;
    }

    state.playerShots.push({
      x: state.player.x + 8,
      y: state.player.y - 7,
    });
  }, []);

  const useBomb = useCallback(() => {
    const state = game.current;
    if (
      !state.running ||
      !state.alive ||
      state.paused ||
      state.bombs < 1 ||
      state.blast
    ) {
      return;
    }

    state.bombs -= 1;
    state.blast = {
      x: state.player.x + 8,
      y: state.player.y + 8,
      radius: 10,
    };
  }, []);

  useEffect(() => {
    ["solv", "zap", "fel", "melanza", "espa", "cube"].forEach((name) => {
      const image = new Image();
      image.src = `/sprites/${name}.gif`;
      images.current[name] = image;
    });

    game.current.highScore = Number(localStorage.getItem("xevious-hi") || 0);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const gameKeys = [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "x",
        "c",
        "p",
        " ",
      ];

      if (gameKeys.includes(key)) event.preventDefault();
      pressedKeys.current.add(key);

      if (key === "x" || key === " ") firePlayerShot();
      if (key === "c") useBomb();
      if (key === "r") resetGame();

      if (key === "p" && game.current.running) {
        game.current.paused = !game.current.paused;
        setStatus(game.current.paused ? "PAUSED" : "PLAYING");
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [firePlayerShot, resetGame, useBomb]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.imageSmoothingEnabled = false;

    let animationFrame = 0;
    let previousTime = performance.now();
    let accumulatedTime = 0;

    const addEnemyShot = (enemy: Enemy, angle: number, speed: number) => {
      game.current.enemyShots.push({
        x: enemy.x + 7,
        y: enemy.y + 7,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    };

    const shootAtPlayer = (enemy: Enemy, target: Point, spread = 0) => {
      const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x) + spread;
      addEnemyShot(enemy, angle, 1.5);
    };

    // fel: 真下へ進み、条件を満たすと自機を狙って射撃する。
    const moveFel = (enemy: Enemy, moveSpeed: number, difficulty: number) => {
      enemy.y += moveSpeed;

      const canShoot = enemy.phase === 0 && enemy.y > 70 + Math.random() * 80;
      if (canShoot && Math.random() < 0.018 * difficulty) {
        enemy.phase = 1;
        shootAtPlayer(enemy, game.current.player);
        if (difficulty > 3) shootAtPlayer(enemy, game.current.player, 0.22);
      }
    };

    // melanza: 自機と同じ高さまで下降し、90度転換して水平に突進する。
    const moveMelanza = (enemy: Enemy, moveSpeed: number) => {
      if (enemy.phase === 0) {
        const isBesidePlayer = Math.abs(game.current.player.y - enemy.y) <= 5;
        if (isBesidePlayer) {
          enemy.phase = game.current.player.x < enemy.x ? -1 : 1;
        } else {
          enemy.y += moveSpeed;
        }
        return;
      }

      enemy.x += enemy.phase * moveSpeed;
    };

    // espa: 一定の高さまで下降してから、画面中央へ斜めに寄ってくる。
    const moveEspa = (enemy: Enemy, moveSpeed: number, difficulty: number) => {
      enemy.y += moveSpeed;
      if (enemy.y > 75) enemy.x += Math.sign(105 - enemy.x) * 0.65;

      const canShoot = enemy.phase === 0 && enemy.y > 70 + Math.random() * 80;
      if (canShoot && Math.random() < 0.018 * difficulty) {
        enemy.phase = 1;
        shootAtPlayer(enemy, game.current.player);
        if (difficulty > 3) shootAtPlayer(enemy, game.current.player, 0.22);
      }
    };

    // cube: ゆっくり下降しながら、自機のX座標を追跡する。
    const moveCube = (enemy: Enemy) => {
      enemy.x += Math.sign(game.current.player.x - enemy.x) * 0.7;
      enemy.y += 1;
    };

    const moveEnemy = (enemy: Enemy, difficulty: number) => {
      const moveSpeed = 0.8 + difficulty * 0.32;

      switch (enemy.kind) {
        case 1:
          moveFel(enemy, moveSpeed, difficulty);
          break;
        case 2:
          moveMelanza(enemy, moveSpeed);
          break;
        case 3:
          moveEspa(enemy, moveSpeed, difficulty);
          break;
        case 20:
        case 21:
          moveCube(enemy);
          break;
      }
    };

    const spawnEnemy = () => {
      const state = game.current;
      if (state.spawnTimer > 0 || state.enemies.length >= 5) return;

      const kind = chooseEnemyKind(state.wave);
      const spriteName = getSpriteName(kind);
      state.enemies.push({
        x: Math.random() * 225,
        y: -20,
        kind,
        phase: 0,
        sprite: images.current[spriteName],
      });

      const spawnDifficulty = Math.min(4, 1 + Math.floor(state.wave / 8));
      state.wave += 1;
      state.spawnTimer = Math.max(14, 45 - spawnDifficulty * 6);
    };

    // cubeは通常弾で倒したときだけ撃ち返す。ボムなら反撃しない。
    const fireCubeRetaliation = (enemy: Enemy) => {
      addEnemyShot(enemy, Math.PI / 4, 1.6);
      addEnemyShot(enemy, (Math.PI * 3) / 4, 1.6);

      if (enemy.kind === 21) {
        addEnemyShot(enemy, Math.PI / 3, 1.6);
        addEnemyShot(enemy, (Math.PI * 2) / 3, 1.6);
      }
    };

    const handlePlayerShotsHittingEnemies = () => {
      const state = game.current;

      for (let shotIndex = state.playerShots.length - 1; shotIndex >= 0; shotIndex--) {
        for (let enemyIndex = state.enemies.length - 1; enemyIndex >= 0; enemyIndex--) {
          const shot = state.playerShots[shotIndex];
          const enemy = state.enemies[enemyIndex];
          if (!objectsOverlap(shot, enemy, 18)) continue;

          state.playerShots.splice(shotIndex, 1);
          state.enemies.splice(enemyIndex, 1);
          if (enemy.kind === 20 || enemy.kind === 21) fireCubeRetaliation(enemy);

          state.score += 10;
          state.chain += 1;
          if (state.chain === 5) {
            state.bombs += 1;
            state.chain = 0;
          }
          break;
        }
      }
    };

    const updatePlayer = () => {
      const player = game.current.player;
      if (pressedKeys.current.has("arrowleft")) player.x -= PLAYER_SPEED;
      if (pressedKeys.current.has("arrowright")) player.x += PLAYER_SPEED;
      if (pressedKeys.current.has("arrowup")) player.y -= PLAYER_SPEED;
      if (pressedKeys.current.has("arrowdown")) player.y += PLAYER_SPEED;

      player.x = Math.max(0, Math.min(SCREEN_WIDTH - 20, player.x));
      player.y = Math.max(28, Math.min(SCREEN_HEIGHT - 22, player.y));
    };

    const updatePlayerShots = () => {
      const state = game.current;
      state.playerShots.forEach((shot) => (shot.y -= 7));
      state.playerShots = state.playerShots.filter((shot) => shot.y > -12);
    };

    const updateEnemyShots = () => {
      const state = game.current;
      state.enemyShots.forEach((shot) => {
        shot.x += shot.vx;
        shot.y += shot.vy;
      });
      state.enemyShots = state.enemyShots.filter(
        (shot) =>
          shot.x > -8 &&
          shot.x < SCREEN_WIDTH + 8 &&
          shot.y > -8 &&
          shot.y < SCREEN_HEIGHT + 8,
      );
    };

    const updateBomb = () => {
      const state = game.current;
      if (!state.blast) return;

      state.blast.radius += 7;
      const { x, y, radius } = state.blast;
      state.enemies = state.enemies.filter((enemy) => {
        const survives = Math.hypot(enemy.x - x, enemy.y - y) > radius;
        if (!survives) state.score += 10;
        return survives;
      });
      state.enemyShots = state.enemyShots.filter(
        (shot) => Math.hypot(shot.x - x, shot.y - y) > radius,
      );
      if (radius > 380) state.blast = null;
    };

    const checkGameOver = () => {
      const state = game.current;
      const hitEnemy = state.enemies.some((enemy) =>
        objectsOverlap(state.player, enemy, 18),
      );
      const hitEnemyShot = state.enemyShots.some((shot) =>
        objectsOverlap(state.player, shot, 12),
      );
      if (!hitEnemy && !hitEnemyShot) return;

      state.alive = false;
      state.highScore = Math.max(state.highScore, state.score);
      localStorage.setItem("xevious-hi", String(state.highScore));
      setStatus("GAME OVER");
    };

    const removeOffscreenEnemies = () => {
      game.current.enemies = game.current.enemies.filter(
        (enemy) =>
          enemy.y < SCREEN_HEIGHT + 25 &&
          enemy.x > -30 &&
          enemy.x < SCREEN_WIDTH + 30,
      );
    };

    const updateGame = () => {
      const state = game.current;
      if (!state.running || state.paused || !state.alive) return;

      updatePlayer();
      updatePlayerShots();
      state.spawnTimer -= 1;
      spawnEnemy();

      const difficulty = getDifficulty(state.wave);
      state.enemies.forEach((enemy) => moveEnemy(enemy, difficulty));

      handlePlayerShotsHittingEnemies();
      updateEnemyShots();
      updateBomb();
      checkGameOver();
      removeOffscreenEnemies();
    };

    const drawGame = () => {
      const state = game.current;
      context.fillStyle = "#020806";
      context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

      context.fillStyle = "#10352a";
      for (let y = 25; y < SCREEN_HEIGHT; y += 24) {
        const scrollY = (y + performance.now() / 45) % SCREEN_HEIGHT;
        context.fillRect(18, scrollY, 1, 1);
        context.fillRect(219, (scrollY + 11) % SCREEN_HEIGHT, 1, 1);
      }

      context.font = "10px monospace";
      context.fillStyle = "#f4f2d8";
      context.fillText(`HI ${String(state.highScore).padStart(5, "0")}`, 84, 13);
      context.fillText(String(state.score).padStart(5, "0"), 202, 13);

      if (state.running && state.alive && images.current.solv?.complete) {
        context.drawImage(images.current.solv, state.player.x, state.player.y);
      }
      state.playerShots.forEach((shot) => {
        if (images.current.zap?.complete) {
          context.drawImage(images.current.zap, shot.x, shot.y);
        }
      });
      state.enemies.forEach((enemy) => {
        if (enemy.sprite?.complete) context.drawImage(enemy.sprite, enemy.x, enemy.y);
      });

      context.fillStyle = "#ffe85c";
      state.enemyShots.forEach((shot) => context.fillRect(shot.x, shot.y, 4, 4));

      if (state.blast) {
        context.strokeStyle = "#ffe85c";
        context.lineWidth = 5;
        context.beginPath();
        context.arc(state.blast.x, state.blast.y, state.blast.radius, 0, Math.PI * 2);
        context.stroke();
      }

      context.fillStyle = "#a5ffcf";
      context.fillText(`BOMBS ${state.bombs}`, 7, 290);
      context.fillText(`CHAIN ${state.chain}/5`, 169, 290);

      if (!state.running || !state.alive || state.paused) {
        context.fillStyle = "rgba(2,8,6,.72)";
        context.fillRect(34, 118, 182, 55);
        context.textAlign = "center";
        context.fillStyle = "#f4f2d8";
        context.font = "bold 13px monospace";
        context.fillText(
          !state.running ? "CLICK TO START" : state.paused ? "PAUSE" : "GAME OVER",
          SCREEN_WIDTH / 2,
          143,
        );
        context.font = "9px monospace";
        context.fillStyle = "#83ffc0";
        context.fillText(
          !state.running
            ? "ARROWS / X / C"
            : state.alive
              ? "PRESS P TO RESUME"
              : "CLICK TO RESTART",
          SCREEN_WIDTH / 2,
          160,
        );
        context.textAlign = "left";
      }
    };

    const gameLoop = (now: number) => {
      // 最大100msに制限し、タブ復帰時にゲームが一気に進むのを防ぐ。
      accumulatedTime = Math.min(accumulatedTime + now - previousTime, 100);
      previousTime = now;

      // 20ms固定更新なので、PC性能や画面のリフレッシュレートに依存しない。
      while (accumulatedTime >= 20) {
        updateGame();
        accumulatedTime -= 20;
      }

      drawGame();
      animationFrame = requestAnimationFrame(gameLoop);
    };

    animationFrame = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  const holdDirection = (key: string, isPressed: boolean) => {
    if (isPressed) pressedKeys.current.add(key);
    else pressedKeys.current.delete(key);
    canvasRef.current?.focus();
  };

  return (
    <main>
      <section className="intro">
        <p className="eyebrow">REBUILT FROM A STUDENT JAVA APPLET</p>
        <h1>
          XEVIOUS <span>RE:FLIGHT</span>
        </h1>
        <p className="lede">
          あの頃の250×300ピクセルを、いまのブラウザへ。
          <br />
          原作の手触りを残した、小さな縦スクロールシューティング。
        </p>
        <div className="meta">
          <span>ORIGINAL CODE</span><b>JAVA APPLET</b>
          <span>NOW RUNNING</span><b>HTML5 CANVAS</b>
        </div>
      </section>

      <section className="cabinet" aria-label="シューティングゲーム">
        <div className="bezel">
          <div className="screen-label"><span>SYSTEM 01</span><i>{status}</i></div>
          <canvas
            ref={canvasRef}
            width={SCREEN_WIDTH}
            height={SCREEN_HEIGHT}
            tabIndex={0}
            onClick={() => {
              if (!game.current.running || !game.current.alive) resetGame();
            }}
            aria-label="ゲーム画面。クリックで開始"
          />
          <p className="hint">CLICK SCREEN TO START / RESTART</p>
        </div>

        <div className="controls">
          <div className="dpad" aria-label="移動ボタン">
            <button className="up" aria-label="上" onPointerDown={() => holdDirection("arrowup", true)} onPointerUp={() => holdDirection("arrowup", false)}>▲</button>
            <button className="left" aria-label="左" onPointerDown={() => holdDirection("arrowleft", true)} onPointerUp={() => holdDirection("arrowleft", false)}>◀</button>
            <button className="right" aria-label="右" onPointerDown={() => holdDirection("arrowright", true)} onPointerUp={() => holdDirection("arrowright", false)}>▶</button>
            <button className="down" aria-label="下" onPointerDown={() => holdDirection("arrowdown", true)} onPointerUp={() => holdDirection("arrowdown", false)}>▼</button>
          </div>
          <button className="action bomb" onPointerDown={useBomb}><small>C</small>BOMB</button>
          <button className="action shoot" onPointerDown={firePlayerShot}><small>X</small>SHOT</button>
        </div>
      </section>

      <aside className="manual">
        <h2>FLIGHT MANUAL</h2>
        <dl>
          <div><dt>MOVE</dt><dd>ARROW KEYS</dd></div>
          <div><dt>SHOT</dt><dd>X / SPACE</dd></div>
          <div><dt>BOMB</dt><dd>C</dd></div>
          <div><dt>PAUSE</dt><dd>P</dd></div>
          <div><dt>RESTART</dt><dd>R</dd></div>
        </dl>
        <p>敵を5機連続で撃墜するとボムを補給。ウェーブが進むほど敵は速く、攻撃は激しくなる。</p>
      </aside>

      <footer>AN ARCHIVE RESTORED FOR THE MODERN WEB <span>© ORIGINAL CREATOR</span></footer>
    </main>
  );
}
