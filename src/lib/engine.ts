import type { ChartNote } from "./chart";

export const LANES = 5;
export const HIT_WINDOW = 0.11; // seconds either side
export const LANE_X = [-1.8, -0.9, 0, 0.9, 1.8] as const;
export const LANE_COLORS = ["#2ee06a", "#ff3b3b", "#ffd230", "#2f8fff", "#ff8a1f"] as const;

export type NoteState = 0 | 1 | 2; // pending | hit | missed

export interface HudSnapshot {
  score: number;
  combo: number;
  multiplier: number;
  health: number;
  starPower: number;
  spActive: boolean;
  notesHit: number;
  notesTotal: number;
  streakBest: number;
}

export class GameEngine {
  readonly notes: ChartNote[];
  readonly states: NoteState[];
  readonly sustainOn: boolean[];

  score = 0;
  combo = 0;
  streakBest = 0;
  health = 0.6;
  starPower = 0;
  spActive = false;
  notesHit = 0;
  failed = false;

  held: [boolean, boolean, boolean, boolean, boolean] = [false, false, false, false, false];
  flash: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  lastMissAt = -10;

  private cursor = 0; // first index not yet resolved

  constructor(notes: ChartNote[]) {
    this.notes = notes;
    this.states = notes.map(() => 0 as NoteState);
    this.sustainOn = notes.map(() => false);
  }

  get multiplier() {
    const base = Math.min(4, 1 + Math.floor(this.combo / 10));
    return this.spActive ? base * 2 : base;
  }

  activateStarPower() {
    if (this.starPower >= 0.5 && !this.spActive) {
      this.spActive = true;
    }
  }

  press(lane: number, now: number) {
    this.held[lane as 0] = true;
    let best = -1;
    let bestDelta = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.time > now + HIT_WINDOW) break;
      if (n.lane !== lane || this.states[i] !== 0) continue;
      const d = Math.abs(n.time - now);
      if (d <= HIT_WINDOW && d < bestDelta) {
        best = i;
        bestDelta = d;
      }
    }
    if (best >= 0) {
      this.states[best] = 1;
      this.sustainOn[best] = this.notes[best]!.duration > 0;
      this.notesHit++;
      this.combo++;
      this.streakBest = Math.max(this.streakBest, this.combo);
      this.score += 50 * this.multiplier;
      this.health = Math.min(1, this.health + 0.012);
      this.flash[lane as 0] = 1;
      if (this.notes[best]!.sp) this.starPower = Math.min(1, this.starPower + 0.02);
    } else {
      this.registerMiss(now);
    }
  }

  release(lane: number) {
    this.held[lane as 0] = false;
  }

  private registerMiss(now: number) {
    this.combo = 0;
    this.health = Math.max(0, this.health - 0.035);
    this.lastMissAt = now;
    if (this.health <= 0) this.failed = true;
  }

  /** Advance time: resolve missed notes and award sustains. */
  update(now: number, delta: number) {
    while (this.cursor < this.notes.length) {
      const n = this.notes[this.cursor]!;
      if (n.time + n.duration + HIT_WINDOW > now) break;
      if (this.states[this.cursor] === 0) {
        this.states[this.cursor] = 2;
        this.registerMiss(now);
      }
      this.cursor++;
    }
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.time > now + HIT_WINDOW) break;
      if (this.states[i] === 0 && n.time < now - HIT_WINDOW) {
        this.states[i] = 2;
        this.registerMiss(now);
      }
      if (this.sustainOn[i]) {
        if (now > n.time + n.duration) {
          this.sustainOn[i] = false;
        } else if (this.held[n.lane as 0]) {
          this.score += 220 * this.multiplier * delta;
        } else {
          this.sustainOn[i] = false;
        }
      }
    }
    if (this.spActive) {
      this.starPower = Math.max(0, this.starPower - delta / 24);
      if (this.starPower <= 0) this.spActive = false;
    }
    for (let l = 0; l < LANES; l++) {
      this.flash[l as 0] = Math.max(0, this.flash[l as 0] - delta * 5);
    }
  }

  snapshot(): HudSnapshot {
    return {
      score: Math.floor(this.score),
      combo: this.combo,
      multiplier: this.multiplier,
      health: this.health,
      starPower: this.starPower,
      spActive: this.spActive,
      notesHit: this.notesHit,
      notesTotal: this.notes.length,
      streakBest: this.streakBest,
    };
  }
}
