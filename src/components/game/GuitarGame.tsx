import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { loadChart, type Chart } from "@/lib/chart";
import { GameEngine, type HudSnapshot } from "@/lib/engine";
import { HighwayScene } from "./Highway";
import { HUD } from "./HUD";

import notesAsset from "@/assets/notes.mid.asset.json";
import songAsset from "@/assets/song.ogg.asset.json";
import guitarAsset from "@/assets/guitar.ogg.asset.json";
import rhythmAsset from "@/assets/rhythm.ogg.asset.json";
import drumsAsset from "@/assets/drums.ogg.asset.json";
import vocalsAsset from "@/assets/vocals.ogg.asset.json";

const SONG = { name: "Fade to Black", artist: "Metallica", album: "Ride the Lightning", year: 1984 };
const STEMS = [songAsset.url, guitarAsset.url, rhythmAsset.url, drumsAsset.url, vocalsAsset.url];
const DEFAULT_KEYS = ["a", "s", "d", "f", "g"];
const FRET_NAMES = ["Verde", "Vermelho", "Amarelo", "Azul", "Laranja"];

type Phase = "loading" | "ready" | "playing" | "finished";

export function GuitarGame() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [chart, setChart] = useState<Chart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadPct, setLoadPct] = useState(0);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [progress, setProgress] = useState(0);
  const [keys, setKeys] = useState(DEFAULT_KEYS);
  const [editingKey, setEditingKey] = useState<number | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);

  const engineRef = useRef<GameEngine | null>(null);
  const audioRef = useRef<HTMLAudioElement[]>([]);
  const timeRef = useRef(0);
  const rafRef = useRef(0);

  const getTime = useCallback(() => timeRef.current, []);
  const keyMap = useMemo(() => Object.fromEntries(keys.map((key, lane) => [key, lane])), [keys]);

  // Load chart + audio
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const parsed = await loadChart(notesAsset.url);
        if (cancelled) return;
        setChart(parsed);
        engineRef.current = new GameEngine(parsed.notes);

        let ready = 0;
        const els = STEMS.map((url) => {
          const a = new Audio();
          a.src = url;
          a.preload = "auto";
          a.crossOrigin = "anonymous";
          a.addEventListener(
            "canplaythrough",
            () => {
              ready++;
              setLoadPct(ready / STEMS.length);
              if (ready === STEMS.length && !cancelled) setPhase("ready");
            },
            { once: true },
          );
          a.load();
          return a;
        });
        audioRef.current = els;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load the song");
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current.forEach((a) => {
        a.pause();
        a.src = "";
      });
    };
  }, []);

  // Main clock + HUD sync
  useEffect(() => {
    if (phase !== "playing") return;
    const engine = engineRef.current!;
    const master = audioRef.current[0]!;
    let hudTick = 0;

    const loop = () => {
      timeRef.current = master.currentTime;
      setProgress(master.duration ? master.currentTime / master.duration : 0);

      // duck the guitar stem right after a miss
      const guitar = audioRef.current[1];
      if (guitar) {
        const since = timeRef.current - engine.lastMissAt;
        guitar.volume = since >= 0 && since < 0.35 ? 0 : 1;
      }

      hudTick++;
      if (hudTick % 4 === 0) setHud(engine.snapshot());

      if (master.ended || engine.failed) {
        audioRef.current.forEach((a) => a.pause());
        setHud(engine.snapshot());
        setPhase("finished");
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Input
  useEffect(() => {
    if (phase !== "playing" || controlsOpen || editingKey !== null) return;
    const engine = engineRef.current!;
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key === "shift") {
        engine.activateStarPower();
        return;
      }
      const lane = keyMap[key];
      if (lane === undefined) return;
      e.preventDefault();
      engine.press(lane, timeRef.current);
    };
    const up = (e: KeyboardEvent) => {
      const lane = keyMap[e.key.toLowerCase()];
      if (lane !== undefined) engine.release(lane);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [controlsOpen, editingKey, keyMap, phase]);

  useEffect(() => {
    if (editingKey === null) return;
    const captureKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setEditingKey(null);
        return;
      }
      const key = e.key.toLowerCase();
      if (["shift", "control", "alt", "meta"].includes(key)) return;
      setKeys((current) => {
        const previousKey = current[editingKey] ?? key;
        return current.map((value, index) => {
          if (index === editingKey) return key;
          return value === key ? previousKey : value;
        });
      });
      setEditingKey(null);
    };
    window.addEventListener("keydown", captureKey);
    return () => window.removeEventListener("keydown", captureKey);
  }, [editingKey]);

  const start = useCallback(() => {
    const engine = new GameEngine(chart!.notes);
    engineRef.current = engine;
    timeRef.current = 0;
    audioRef.current.forEach((a) => {
      a.currentTime = 0;
      a.volume = 1;
      void a.play();
    });
    setHud(engine.snapshot());
    setPhase("playing");
  }, [chart]);

  const lanePress = useCallback((lane: number) => {
    engineRef.current?.press(lane, timeRef.current);
  }, []);
  const laneRelease = useCallback((lane: number) => {
    engineRef.current?.release(lane);
  }, []);

  const engine = engineRef.current;
  const canvas = useMemo(
    () =>
      engine ? (
        <Canvas
          shadows
          dpr={[1, 1.75]}
          camera={{ position: [0, 3.1, 6.4], fov: 58 }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(new THREE.Vector3(0, 0.4, -9));
            gl.toneMapping = THREE.ACESFilmicToneMapping;
          }}
        >
          <color attach="background" args={["#000000"]} />
          <Suspense fallback={null}>
            <HighwayScene engine={engine} getTime={getTime} />
          </Suspense>
        </Canvas>
      ) : null,
    [engine, getTime],
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {canvas}

      <button
        type="button"
        onClick={() => setControlsOpen(true)}
        className="absolute right-5 top-5 z-30 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-foreground backdrop-blur transition hover:bg-card"
      >
        Configurar teclas
      </button>

      {controlsOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-foreground">Teclas de comando</h2>
                <p className="mt-1 text-sm text-muted-foreground">Clique em uma tecla e pressione a nova opção.</p>
              </div>
              <button type="button" onClick={() => setControlsOpen(false)} className="text-muted-foreground transition hover:text-foreground" aria-label="Fechar menu de teclas">
                ✕
              </button>
            </div>
            <div className="mt-5 space-y-2">
              {keys.map((key, index) => (
                <div key={FRET_NAMES[index]} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
                  <span className="text-sm text-foreground">{FRET_NAMES[index]}</span>
                  <button
                    type="button"
                    onClick={() => setEditingKey(index)}
                    className="min-w-20 rounded-md border border-border bg-background px-3 py-1 font-mono text-sm uppercase text-foreground transition hover:border-primary"
                  >
                    {editingKey === index ? "Pressione..." : key}
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setKeys(DEFAULT_KEYS)}
              className="mt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
            >
              Restaurar padrão
            </button>
          </div>
        </div>
      )}

      {phase === "playing" && hud && (
        <HUD
          hud={hud}
          songName={SONG.name}
          artist={SONG.artist}
          progress={progress}
          onLanePress={lanePress}
          onLaneRelease={laneRelease}
        />
      )}

      {(phase === "loading" || phase === "ready" || phase === "finished") && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gradient-to-b from-black/85 via-black/70 to-black/95 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md text-center">
            <p className="font-display text-5xl tracking-tight text-foreground drop-shadow-[0_0_26px_rgba(255,50,50,0.45)] md:text-6xl">
              GUITAR TOUR
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.4em] text-muted-foreground">
              Expert Lead Guitar
            </p>

            <div className="mt-8 rounded-2xl border border-border/50 bg-card/70 p-6 text-left">
              <h1 className="font-display text-2xl text-foreground">{SONG.name}</h1>
              <p className="text-sm text-muted-foreground">
                {SONG.artist} · {SONG.album} · {SONG.year}
              </p>
              {chart && (
                <p className="mt-3 text-xs uppercase tracking-widest text-accent">
                  {chart.notes.length} notes · {Math.floor(chart.duration / 60)}:
                  {String(Math.floor(chart.duration % 60)).padStart(2, "0")}
                </p>
              )}

              {phase === "finished" && hud && (
                <div className="mt-4 space-y-1 border-t border-border/50 pt-4 text-sm text-foreground">
                  <p className="font-display text-3xl text-accent">{hud.score.toLocaleString()}</p>
                  <p className="text-muted-foreground">
                    {hud.notesHit}/{hud.notesTotal} notes · best streak x{hud.streakBest}
                  </p>
                  {engineRef.current?.failed && (
                    <p className="text-destructive">You were booed off stage!</p>
                  )}
                </div>
              )}
            </div>

            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

            {phase === "loading" && !error && (
              <div className="mt-8">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                  <div
                    className="h-1.5 bg-primary transition-[width]"
                    style={{ width: `${Math.max(6, loadPct * 100)}%` }}
                  />
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
                  Loading chart & stems…
                </p>
              </div>
            )}

            {(phase === "ready" || phase === "finished") && (
              <button
                onClick={start}
                className="mt-8 w-full rounded-xl bg-primary px-6 py-4 font-display text-xl uppercase tracking-[0.2em] text-primary-foreground shadow-[0_0_40px_rgba(220,38,38,0.45)] transition hover:brightness-110 active:scale-[0.99]"
              >
                {phase === "finished" ? "Play again" : "Start the show"}
              </button>
            )}

            <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
              Keys <span className="text-foreground">A S D F G</span> hit the five frets · hold for
              sustains · <span className="text-foreground">Shift</span> unleashes Star Power
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
