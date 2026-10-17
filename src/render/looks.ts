/**
 * looks.ts — what each special look (a kind's `variant`) draws differently from a plain stick
 * figure, so the scene and the combat screen ask the look rather than which enemy it is.
 */
import type { ReactNode } from "react";
import type { Variant } from "../core/bestiary";
import { WARDEN_LOOK } from "../warden/look";
import type { CandleArm, WardenPoseName } from "../warden/skeleton";
import type { Pt } from "./geom";
import type { Skeleton } from "./poses";

/** What a figure drawn by its look itself is given. */
export interface OwnFigureProps {
  s: Skeleton;
  front: boolean;
  arm?: CandleArm;
  lingerFrom?: WardenPoseName;
  smokeAgo?: number;
  phase2Look?: boolean;
  flailFire?: boolean;
}

export interface VariantLook {
  /** It draws itself (in its poses), in place of the stick figure, over a shadow this size. */
  figure?: { owns: (s: Skeleton) => boolean; draw: (p: OwnFigureProps) => ReactNode; shadow: { rx: number; ry: number } };
  /** Its flame comes and goes (a candle arm: lit, out or scorched), and its weapon can burn. */
  candleArm?: boolean;
  /** Entering phase two plays the scene where every flame around streams into its hand (IGNITE). */
  igniteScene?: boolean;
  /** The hand flames stream into (Usurp Flame, phase two), in figure units. */
  flameHand?: Pt;
  /** Its own flame, alone in the dark, drawn this big (a share of its height). */
  loneFlame?: number;
}

const LOOKS: Partial<Record<Variant, VariantLook>> = {
  warden: WARDEN_LOOK,
};

export const lookOf = (variant?: Variant): VariantLook | undefined => (variant ? LOOKS[variant] : undefined);
