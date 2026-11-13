/**
 * pose3d.ts — the Penitent Warden's poses on the 3D rig (`render/Warden3D.tsx`).
 *
 * His flat poses (skeleton.ts) were tuned to trick the eye in the 3/4 view: their shoulders, hips and flags (`turn`, `faceBack`, `backView`,
 * `flailArmOver`...) are not real positions. So his 3D turn is not translated from them: each pose says how far his HIPS and his SHOULDERS really
 * face (`WARDEN_STANCE`), read from the two things the art commits to: the opening of his robe (his left side, sealed from armpit to hip, gaping
 * below it) and his wax shoulder (the left one, the candle arm): which way each faces, and so how far the chest has turned on the hips.
 * The flat poses only say where his hands, flail and feet go.
 *
 * Angles are degrees from facing whoever he fights, positive when his LEFT side (the robe's opening, the wax shoulder) swings toward them, negative
 * when his right (flail) shoulder leads and the wax side turns away.
 */
import { METERS_PER_UNIT as U, type Cam, type Vec } from "../render/camera";
import type { Side } from "../core/types";
import { RIG } from "../render/rig";
import { JOINTS, liftPose, type P3, placeRig, type Rig3 } from "../render/rig3d";
import type { Skeleton } from "../render/poses";
import { WARDEN_POSES, type WardenPoseName, type WardenSkeleton } from "./skeleton";

/**
 * How far a pose turns his hips and his shoulders (degrees; see the file's note), and anything else the 3D rig should do differently for it.
 * `head`: where his face turns, the same way (by default as near whoever he fights as his neck lets him).
 * `lean`: all of him tipped over toward his right (degrees; negative: his left), pivoting on that foot, as he springs away. `leanAhead`: tipped forward, the
 * way his hips face (negative: back), pivoting on the foot further ahead, as she flings herself into a leap. He is built upright and tipped
 * as one piece, cloth and all, so his robe hangs along him as if its pull had swung over with the lean: a dodge's motion throws it back the other way.
 */
export interface Stance {
  hips: number; shoulders: number; head?: number; lean?: number; leanAhead?: number; for3d?: Skeleton["for3d"];
  /** How far up his face points (degrees; negative: down), in his own frame, in place of the flat pose's `tilt`: with a lean, what makes his gaze level. */
  pitch?: number;
  /**
   * The flail held its own way in 3D, in body space (x his right, y up, z ahead, as his hips face; any length): the way the handle points from his
   * fist toward the chain's end, and the way the chain runs from there to the head (it hangs that way, straight, unless the floor stops it).
   * `held`: his candle hand holds the chain this far (figure units) from the head: the chain runs from the handle to that hand, and on from it, the way
   * `chain` says, to the head. Or `taut`: his candle hand holds it pulled straight from the handle, and the rest of its length runs on past the hand to the head.
   * Or `rest`: the head lies on the floor, the chain running along it from the handle's tip the way `chain` points (its way along the floor, as far as its length goes).
   */
  flail?: { handle: P3; chain: P3; held?: number; taut?: boolean; rest?: boolean };
  /**
   * The 3D figure draws the trail of the flail coming on from where this pose has its head (it carries on that pose's `arch`) down into the whirl it spins
   * in here, meeting the whirl's ring at its back, going the way it turns.
   */
  arch2?: WardenPoseName;
  /**
   * The 3D figure draws the trail of a blow swung up to where the flail's head is: from `from` (body space, as her hips face), bowing out `bulge` (meters)
   * before her chest on its way, up to the head. `reaching`: bowing out toward whoever she fights instead, so the blow sweeps out at them.
   */
  blowArc?: { from: P3; bulge: number; thick?: number; reaching?: boolean };
  /** The way the flail's head is travelling in this pose, in body space (as her hips face), if it is not one a trail says (`blowArc`, `slamFrom`, `arch`): a flaming head's wick trails behind it. */
  flailMotion?: P3;
  /** How far the chain bows off the straight line from the handle to the head (figure units; down, as a chain hangs; negative: up, as one whipped up does). */
  chainBow?: number;
  /** The flail whirls in the plane square to its handle (it spins round the handle's line), not upright along the way her chest faces. */
  spinSquare?: boolean;
  /** The flail whirls in the plane facing whoever she fights (square to the way to them, upright), whatever way its handle points. */
  spinFacing?: boolean;
  /**
   * The 3D figure draws the trail of the flail brought down from the whirl over her head in this pose (where its head was going round, at the back of it,
   * away from where it comes down) up over and down to where its head is here.
   */
  slamFrom?: WardenPoseName;
  /** The 3D figure draws the trail of the flail's swing up to where its head is: from low in front of her, round her flail shoulder, up and back over to it. */
  arch?: boolean;
  /** The pelvis egg's axis swung this share of the way toward the spine (the line up to the chest egg's middle): for a pose whose chest is turned well away from its hips. */
  pelvisAlign?: number;
  /** Her bottom egg turned this far (degrees) about its own axis toward her right (so a leg reaching forward on her left does not pull the robe with it). */
  pelvisTurn?: number;
  /** Her right leg is not drawn (the skirt covers it all): a cheat, for a pose whose skirt shows nothing of it. */
  hideRightLeg?: boolean;
  /** Her skirt has a smoother outline: the cloth round her right leg is taken out further and more broadly, its bends are rounder, and the knee's ring is faired between the rings round it. */
  skirtSmooth?: boolean;
  /** The rim of the skirt's opening in front of her, on her left, drops almost straight down to the floor from the belt, whatever drags the cloth next to it. */
  skirtRimDrop?: boolean;
  /** Her left leg never moves the robe: the skirt hangs as if it were not there (it comes out through the opening on her left, and cloth and leg are only sorted by depth). */
  skirtFreeLeftLeg?: boolean;
  /** Her skirt is pulled back, against gravity, so that its hem stays this high above the floor (figure units): where it is longer than she is high, the rest of its length runs
   *  backward, along her motion, instead of reaching the floor and crumpling there. */
  skirtLift?: number;
  /** How far her skirt hangs back from her motion forward (figure units at the hem; less higher up): the cloth lags behind her as she moves toward her target. */
  skirtDrag?: number;
  /** Her robe's bottom egg tipped back about her pelvis this far (degrees), its middle with it; the spine leans forward to meet her chest where it is. */
  pelvisBack?: number;
}

const S = (hips: number, shoulders: number): Stance => ({ hips, shoulders });

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Idle's arms in space: the flail arm hanging a little out from his side, the forearm out a little further (the flat pose spreads the hands across the
 * picture, which the lift would make a swing forward and back); the wax arm further out and back, so that from the camera it stands clear of his
 * body. Directions in body space (x his right, y up, z ahead): upper arm, then forearm.
 */
export const IDLE_ARMS: Skeleton["arms3"] = {
  right: { dirs: [[0.3, -0.95, 0.05], [0.45, -0.88, 0.15]] },
  left: { dirs: [[-0.45, -0.85, -0.25], [-0.55, -0.7, -0.45]] },
};

/** Flail Spinning Behind (see `WARDEN_STANCE`), shared with Wind Up Flail's landing in it. */
const SPIN_BEHIND: Stance = {
  hips: 50, shoulders: 90,
  for3d: { arms3: { right: { dirs: [[0.074, -0.5, -0.846], [0.449, -0.59, -0.668]] }, left: { dirs: [[0.29, -0.6, 0.857], [0.583, 0.15, 0.777]] } }, splay3: 18 },
  // (the handle out to her right, a little back and down: nearly square to the wheel the flail whirls in behind her, which stands on its tip, upright
  // along the way her chest faces, as it was)
  flail: { handle: [0.632, -0.1, -0.726], chain: [0, 1, 0] },
};

/** Spin Guard's windup (see `WARDEN_STANCE`), shared with its guard. */
const CHAIN_READY: Stance = {
  hips: 50, shoulders: 90, spinSquare: true,
  for3d: {
    arms3: { right: { dirs: [[0.718, -0.6, 0.311], [0.694, -0.25, 0.593]] }, left: { dirs: [[0.29, -0.6, 0.857], [0.583, 0.15, 0.777]] } }, splay3: 18,
    legDirs3: { right: [[0.213, -0.759, 0.615], [0.266, -0.951, -0.157]], left: [[-0.26, -0.93, 0.261], [-0.234, -0.835, -0.498]] },
  },
  flail: { handle: [0.815, -0.1, 0.571], chain: [0, 1, 0] },
};

/** Wax Arm Back (see its entry below): the stance, shared with the landing of Fan Flames and Wax Guard. */
const ARM_BACK: Stance = {
  hips: -50, shoulders: -65, pitch: -37, pelvisAlign: 0.5,
  flail: { handle: [-0.43, -0.5, 0.75], chain: [0.15, -0.1, 1], rest: true },
  for3d: { hip: [49, 77], waist: [51.9, 63.3], neck: [60.9, 47.7], head: [68.5, 40.1], arms3: { right: { dirs: [[0.75, -0.5, 0.43], [0.125, -0.65, 0.756]] }, left: { aim: { dir: [-0.766, -0.01, 0.643], reach: 0.78, bend: [-0.611, 0.3, -0.808] } } }, legDirs3: { right: [[0.626, -0.691, 0.362], [0.626, -0.691, 0.362]], left: [[-0.746, -0.259, 0.613], [-0.15, -0.985, -0.087]] } },
};

/**
 * Wax Punch and Flame Blast, as they land: dropped very low, her left knee nearly on the floor and her right foot out ahead, her torso hunched far forward over her
 * hips (the bend at her waist and the head bowed under it), her spine pointing straight at her target and her chest turned about it to her left (`roll3`), which brings her wax shoulder down, so that her wax fist is driven into
 * the floor ahead of her. Her arms are angled a little up and out from her body, the flail arm out to her right with the flail's head resting on the floor.
 */
const PUNCH: Stance = {
  hips: 0, shoulders: 0, pitch: -30,
  flail: { handle: [0.55, 0.15, -0.2], chain: [0.4, -0.1, -1], rest: true },
  for3d: {
    // (the spine bent in three: her lower spine, up from the pelvis, leans 40° forward of upright; her ribcage, from the waist, 82°, nearly level; and her head hangs from the neck,
    // bowed)
    hip: [44, 100], waist: [49.8, 91.9], neck: [66.4, 89.5], head: [76, 91], roll3: -45,
    // (her flail hand where it was, out to her right and up a little, but the elbow bends the other way, back, away from her target; her wax arm no longer straight: the upper arm turned out
    // to her left from the shoulder, the forearm bent back in to her right, to the fist on the floor)
    arms3: { right: { aim: { dir: [0.953, 0.295, -0.072], reach: 0.949, bend: [0, 0, -1] } }, left: { aim: { dir: [-0.1, -0.875, 0.474], reach: 0.9, bend: [-1, 0.2, 0] } } },
    legDirs3: { left: [[-0.45, -0.6, -0.66], [-0.3, -0.05, -0.95]], right: [[0.45, -0.15, 0.88], [0.35, -0.35, -0.87]] },
  },
};

/**
 * Wax Punch and Flame Blast a moment after the blow: the same position (the spine's bends, her chest turned, her arms, her legs splayed out), but her stance not so low: her
 * legs straighter, her hips raised, so that she comes up toward the stance that follows instead of jumping to it.
 */
const PUNCH_AFTER: Stance = {
  ...PUNCH,
  for3d: { ...PUNCH.for3d, legDirs3: { left: [[-0.45, -0.35, -0.82], [-0.3, -0.48, -0.82]], right: [[0.45, -0.25, 0.86], [0.3, -0.55, -0.78]] } },
};

/**
 * Fan Flames and Wax Guard, as they land (the backhand swat): Wax Arm Back's position, with her wax arm much less bent: stretched out nearly straight from her shoulder, the way it
 * points there.
 */
const FAN: Stance = {
  ...ARM_BACK,
  hips: -60, shoulders: -75,
  for3d: { ...ARM_BACK.for3d, arms3: { right: ARM_BACK.for3d!.arms3!.right, left: { aim: { dir: [-0.766, -0.01, 0.643], reach: 0.97, bend: [-0.611, 0.3, -0.808] } } } },
};

/**
 * Fan Flames and Wax Guard, winding up: Wax Arm Raised's stance (Wax Shoulder In: the wax shoulder forward, her flail arm trailing low behind), but with her wax elbow lowered: the
 * upper arm out and up a little from her shoulder instead of straight up, the forearm still up and folded back, so her fist is still raised behind her head.
 */
const WAX_READY: Stance = {
  hips: 55, shoulders: 70,
  for3d: { arms3: { right: { dirs: [[-0.085, -0.947, -0.312], [-0.097, -0.923, -0.368]] }, left: { dirs: [[-0.55, 0.35, 0.15], [0.1, 0.95, -0.3]] } } },
};

/**
 * Dead: Wax Arm Raised's upper body (the wax shoulder forward, her wax arm raised behind her head, her flail arm trailing low), kneeling as a waxed enemy does: both knees on the floor,
 * sitting back on her shins. The 3D figure draws her fully encased in wax under her robes (`Warden3DProps.dead`).
 */
const DEAD: Stance = {
  hips: 45, shoulders: 60,
  flail: { handle: [-0.1, -0.9, -0.4], chain: [0.4, -0.1, -1], rest: true },
  for3d: {
    arms3: { right: { dirs: [[-0.085, -0.947, -0.312], [-0.097, -0.923, -0.368]] }, left: { dirs: [[-0.15, 0.95, 0.25], [0.1, 0.95, -0.3]] } },
    legDirs3: { left: [[-0.2, -0.3, 0.93], [-0.05, -0.05, -1]], right: [[0.2, -0.3, 0.93], [0.05, -0.05, -1]] },
  },
};

/**
 * Staggered: down on her left knee, the knee on the floor, her legs splayed out away from her body and her arms out to her sides, hanging; her body hunched over her hips
 * (the spine bent in three, as in Wax Punch's landing: her lower spine and bottom egg leaning, her ribcage nearly level) and her neck and head bowed under it, her face looking straight
 * down at the floor. The flail lies on the floor beside her.
 */
const FALLEN: Stance = {
  hips: 0, shoulders: 0, pitch: -90,
  flail: { handle: [-0.2, -0.9, 0.2], chain: [0.3, -0.1, -1], rest: true },
  for3d: {
    hip: [44, 100], waist: [51, 95], neck: [66.6, 98], head: [68, 108],
    // (her chest lowered, so that her shoulders are only a forearm's height off the floor; both hands flat on the floor, as if she had caught her fall: the upper arms nearly level, out
    // to her sides, the forearms nearly upright under the elbows)
    arms3: { right: { dirs: [[0.95, 0, 0.2], [0.05, -1, 0.05]] }, left: { dirs: [[-0.95, 0, 0.2], [-0.05, -1, 0.05]] } },
    legDirs3: { left: [[-0.45, -0.6, -0.66], [-0.3, -0.05, -0.95]], right: [[0.45, -0.15, 0.88], [0.35, -0.35, -0.87]] },
  },
};

export const WARDEN_STANCE: Record<WardenPoseName, Stance> = {
  // Stances
  "wd-idle": { hips: 22.5, shoulders: 0, head: 0, for3d: { arms3: IDLE_ARMS } }, // chest out, hands a little out from his sides, the flail on the floor; hips turned 22.5° to his right, the chest and head facing you
  // Wax Shoulder In (and Wax Arm Raised): the wax shoulder forward, its elbow raised high, well over her head, the forearm folded back so the fist is behind her
  // head; the flail arm trails low behind, as the flat pose has it.
  "wd-shoulder": {
    hips: 45, shoulders: 60,
    for3d: { arms3: { right: { dirs: [[-0.085, -0.947, -0.312], [-0.097, -0.923, -0.368]] }, left: { dirs: [[-0.15, 0.95, 0.25], [0.1, 0.95, -0.3]] } } },
  },
  // Wax Arm Back, started from Flail Clutched (below) and tuned on its own from here: all of her turned 20° further round to her left (hips and chest), the flail not
  // clutched but its head resting on the floor in front of her (the handle pointing ahead and down from her fist, the chain lying along the floor the way her hips face).
  // Her neck turns her face to her target (no `head`: as near it as the neck lets her), and her wax elbow is raised a little (the bend's way has some up in it; the hand is
  // where it was). The scene stands her facing her target: the enemy whose flame she goes for with Usurp Flame, else you (`SceneFigure.faceAt`).
  "wd-arm-back": ARM_BACK,
  "wd-arm-chest": S(0, 15), // the wax arm folded across his chest turns that shoulder in a little
  // Wax Arm Back, the flail hauled up by its chain. Turned to her left (all of her 30° back to her right from where the legs and arms were set, so her right
  // leg reaches 30° off the line to you): her right leg leads, reaching out straight toward you (46° off upright), her
  // left leg behind her, bent deep under her sunk weight: the thigh nearly level (15° down), out to her front left, the shin nearly upright under the knee,
  // a little back, to the floor. (Both feet come down to the same height: the straight leg's slant is set by how low the bent one puts her hips.)
  // (her flail arm held out toward you, angled down, the elbow bent, the forearm swung well in toward her left; her wax arm raised to her shoulder's height and held out nearly level, ahead
  // and well round to her left, its elbow bent and swung well out to her left, away from you. The handle points from her fist across her front toward the wax hand, angled 20° down, and the wax hand holds the chain pulled taut from
  // its tip, close to the head: the head hangs just below the wax fist)
  "wd-clutch-flail": {
    // (leaning forward, her back arched: the lower spine 12° forward of upright, the ribcage 30°; her head on from the neck 15° further forward than the
    // ribcage's line (her neck bowed), her face turned 15° from her chest toward you, looking down as the flat pose has her and 15° more with the bowed neck)
    hips: -30, shoulders: -45, head: -30, pitch: -37, pelvisAlign: 0.5,
    flail: { handle: [-0.931, -0.342, -0.13], chain: [0, -1, 0], taut: true },
    for3d: { hip: [49, 77], waist: [51.9, 63.3], neck: [60.9, 47.7], head: [68.5, 40.1], arms3: { right: { dirs: [[0.75, -0.5, 0.43], [0.125, -0.65, 0.756]] }, left: { aim: { dir: [-0.766, -0.01, 0.643], reach: 0.78, bend: [-0.611, 0, -0.808] } } }, legDirs3: { right: [[0.626, -0.691, 0.362], [0.626, -0.691, 0.362]], left: [[-0.746, -0.259, 0.613], [-0.15, -0.985, -0.087]] } },
  },
  // Flail Swing's wind-up: Flail Clutched sunk lower still (the bent left thigh level, 5° down, so the straight right leg reaches out further, 51° off upright),
  // her torso and head wound 15° further round to her left, her wax arm on round to her left more than that (straight out at her left side), and her flail
  // arm dragged round after it, its elbow bent more, the fist across her front.
  "wd-swing-windup": {
    // (the handle from her fist toward the wax hand, 20° down, the chain pulled taut from its tip to the wax fist, the head hanging just below it)
    hips: -30, shoulders: -60, head: -45, pitch: -37, pelvisAlign: 0.5,
    flail: { handle: [-0.787, -0.342, -0.513], chain: [0, -1, 0], taut: true },
    for3d: { hip: [49, 77], waist: [51.9, 63.3], neck: [60.9, 47.7], head: [68.5, 40.1], arms3: { right: { dirs: [[0.558, -0.5, 0.661], [-0.39, -0.65, 0.659]] }, left: { aim: { dir: [-0.996, -0.01, 0.087], reach: 0.78, bend: [-0.036, 0, -1] } } }, legDirs3: { right: [[0.678, -0.622, 0.391], [0.678, -0.622, 0.391]], left: [[-0.769, -0.087, 0.633], [-0.15, -0.985, -0.087]] } },
  },
  // Dodge Lands: where Turn Away's dodge comes down. Flail Clutched, but standing higher (her straight right leg 35° off upright, the left one bent less under
  // her, its thigh well down from level) and all of her turned on round to her right until her chest gives you her back; her face as far from her chest as
  // in Flail Clutched.
  "wd-dodge-land": {
    hips: -165, shoulders: -180, head: -165, pitch: -37, pelvisAlign: 0.5,
    flail: { handle: [-0.931, -0.342, -0.13], chain: [0, -1, 0], taut: true },
    for3d: { hip: [49, 77], waist: [51.9, 63.3], neck: [60.9, 47.7], head: [68.5, 40.1], arms3: { right: { dirs: [[0.75, -0.5, 0.43], [0.125, -0.65, 0.756]] }, left: { aim: { dir: [-0.766, -0.01, 0.643], reach: 0.78, bend: [-0.611, 0, -0.808] } } }, legDirs3: { right: [[0.497, -0.819, 0.287], [0.497, -0.819, 0.287]], left: [[-0.673, -0.672, 0.308], [-0.029, -0.919, -0.393]] } },
  },
  // Flail Spinning Behind: hunched low, the flail whirling behind her. Her hips half turned to her right and her chest on round sideways, its front to her
  // right (her wax side toward you); the wax arm reaching out ahead of her chest and a little to her left, toward you, the elbow low, the forearm rising from
  // it; the flail arm drawn back and down behind her, bent out to her right at the elbow, to give the whirl room; her legs splayed out sideways as well as
  // forward and back.
  "wd-spin-behind": SPIN_BEHIND,
  // Wind Up Flail lands: Flail Spinning Behind, with the trail of the flail coming down from over her head (Wind Up 2's) into the whirl.
  "wd-spin-land": { ...SPIN_BEHIND, arch2: "wd-wound-up" },
  // Wind Up Flail from Kneeling: Kneeling (its body, `pose3d`, arms and flail), half risen: her hips higher, the left knee just off the floor, its shin back to
  // the foot on it; the right thigh level, the shin back under it to its foot; her bottom egg tipped back less.
  "wd-kneel-windup": {
    hips: 0, shoulders: 10, pelvisBack: 20,
    for3d: {
      arms3: { right: { dirs: [[0.13, 0.351, -0.928], [0.119, 0.261, 0.957]] }, left: { dirs: [[-0.503, -0.508, -0.7], [-0.367, -0.856, 0.358]] } },
      legDirs3: { left: [[-0.061, -0.955, 0.289], [0.205, -0.171, -0.964]], right: [[0.208, 0, 0.978], [-0.118, -0.822, -0.557]] },
    },
  },
  "wd-spin-over": S(0, -10), // hips front; the flail arm raised overhead draws its shoulder forward
  // Kneeling: facing you, head bowed, down on her left knee: the left thigh nearly straight down (a little forward), the knee on the floor and the shin laid flat
  // along it behind her; her right knee raised under the cloak, the thigh nearly level, forward from her hips, the knee bent sharply, the shin slanting back from it to
  // the foot on the floor. (She is let down until both feet and the left knee are on the floor.)
  // (her arms as the flat pose has them, each turned a little: the flail arm out to her right and down, away from her body; the wax arm out to her left,
  // away from her body and up, the chain in its fist, the flail's head hanging below it)
  "wd-kneel": {
    // (her robe's bottom egg tipped back a little, the spine leaning forward from it to her chest; the skirt is still dragged by her right leg, but the rim of its opening in front of
    // her drops almost straight down to the floor)
    hips: 0, shoulders: 10, pelvisBack: 30, skirtRimDrop: true, hideRightLeg: true, skirtSmooth: true,
    for3d: {
      arms3: { right: { dirs: [[0.13, 0.351, -0.928], [0.119, 0.261, 0.957]] }, left: { dirs: [[-0.503, -0.508, -0.7], [-0.367, -0.856, 0.358]] } },
      // (each leg turned a little out to its own side: the right one to her right, the left one to her left)
      legDirs3: { left: [[-0.036, -0.985, 0.17], [0.208, 0, -0.978]], right: [[0.207, 0.087, 0.974], [-0.142, -0.731, -0.667]] },
    },
  },
  // Actions
  // Flail Swing lands: her leap past you (`actionPoses`' `leap`). Turn Away (Idle's body, `pose3d`) turned the other way, her hips facing the way she leaps
  // (in a fight she faces along it), her chest turned a little to her left, toward you; flung forward into the leap (`leanAhead`), her left knee raised ahead.
  // Her wax arm stretched out straight behind her, to her left and down, clear of the chain; her flail arm as Turn Away has it, the fist before her chest,
  // the handle across her front to her left and the flail flung out that way, toward you as she passes you.
  "wd-swing": {
    // (her face pointed up as far as the lean tips it down, nearly: she looks ahead and a little down)
    hips: 0, shoulders: -20, head: -25, leanAhead: 35, pitch: 25,
    // (the flail flung through as she leaps past: its head travels on ahead and across, toward her left)
    flailMotion: [-0.5, 0, 0.85],
    for3d: { arms3: { right: { dirs: [[0.9, 0.2, -0.35], [-0.42, 0.1, 0.9]] }, left: { aim: { dir: [-0.55, -0.3, -0.78], reach: 1 } } }, legDirs3: { left: [[-0.1, -0.45, 0.89], [0, -0.85, -0.53]] } },
    // (not in her wax hand: the chain flung out from the handle's tip to her left and a little back)
    flail: { handle: [-0.9, -0.364, 0.45], chain: [-1, -0.25, -0.35] },
  },
  // Rising Flail lands: hips nearly front, the shoulders twisted so the flail shoulder is forward and the wax one back, the flail arm raised over her head. In
  // 3D the flail is seen flying off to her left above her (the handle up as in Flail Spinning Overhead; the chain flung from its tip out to her left), at the end of
  // the blow's trail, swung up from low behind her at her right, round across in front of her, to it (thick: a heavy blow); the chain bowed up, whipped up
  // after the head. Her left leg, behind her, bent as a knee bends: the foot back
  // behind her on the floor, the knee a little forward of the line down to it (the flat pose's, lifted, would bend it backward).
  "wd-rising": {
    hips: -25, shoulders: -70,
    // (the flail arm raised, angled out to her right and down from straight up, away from her face, the elbow pointing at you; the wax arm swung out to her
    // left side, away from her body, down and a little back)
    for3d: {
      arms3: { right: { aim: { dir: [0.52, 0.83, 0.21], reach: 0.951, bend: [0.423, 0, 0.906] } }, left: { dirs: [[-0.212, -0.7, -0.636], [-0.283, -0.8, -0.425]] } },
      legDirs3: { left: [[-0.05, -0.987, 0.138], [0, -0.902, -0.437]] },
    },
    // (the handle as Flail Spinning Overhead holds it, seen from where you are: up, tipped back away from you; written here as her hips face, turned 25° from
    // its)
    flail: { handle: [-0.11, 0.906, -0.409], chain: [-0.6, 0.45, -0.6] },
    blowArc: { from: [0.7, 0.35, -0.8], bulge: 1.2, reaching: true },
    chainBow: -5,
  },
  // Flail Slam lands: kneeling, the flail arm driven down, the wax arm flung up. In 3D the flail arm swung out to her right and a little up from straight
  // down, clear of her body; the wax arm as the flat pose has it.
  "wd-slam": {
    // (the trail of it: from the whirl over her head, Flail Spinning Overhead's, at its back, up over and down onto the floor)
    hips: 0, shoulders: -30, slamFrom: "wd-spin-over",
    for3d: { arms3: { right: { dirs: [[-0.35, -0.8, 0.45], [-0.45, -0.7, 0.5]] }, left: { dirs: [[0.36, 0.696, -0.619], [0.352, -0.704, -0.611]] } }, legDirs3: { left: [[-0.05, -0.97, -0.2], [0, -0.486, -0.874]] } },
    // (the flail swung straight down ahead of her, the way she faces, not off to a side: the handle forward and down from her fist, the chain on ahead and
    // down to its head, slammed onto the floor)
    flail: { handle: [0, -0.5, 0.87], chain: [0, -0.77, 0.638] },
  },
  "wd-punch": PUNCH,
  "wd-punch-after": PUNCH_AFTER,
  "wd-fan": FAN, // the backhand: her wax arm out nearly straight, as in Wax Arm Back (Fan Flames and Wax Guard share their landing)
  "wd-blast": PUNCH, // (Wax Punch and Flame Blast share their landing)
  // Spin Guard, as the blow lands: its windup (Flail Spinning Behind's body, `pose3d`, the flail whirling before her) turned a good way round to her left, all
  // of her, until the handle points at you: the whirl, square to it, faces you, standing between you and her. Her face turned to you.
  // (the handle turned on round to her left, 25° off the line to you; the whirl still facing you, `spinFacing`, whatever way the handle points; the
  // wax arm lowered, hanging down and out at her left side)
  "wd-chain-guard": {
    ...CHAIN_READY, hips: CHAIN_READY.hips - 90, shoulders: CHAIN_READY.shoulders - 90, head: 0, spinSquare: false, spinFacing: true,
    for3d: { ...CHAIN_READY.for3d, arms3: { right: CHAIN_READY.for3d!.arms3!.right, left: { dirs: [[-0.383, -0.85, 0.322], [-0.306, -0.9, 0.257]] } } },
    flail: { handle: [0.256, -0.1, 0.961], chain: [0, 1, 0] },
  },
  "wd-wax-guard": S(0, 10),
  // Idle turned a quarter round to his right, his chest on round to give you his back and his head further still, to his right, leaning away from you (toward his right), his robe swung with him
  // (her left knee raised to the front, the thigh well up, the shin bent back under it, the foot off the floor)
  // (her wax arm reaching back toward you along the flail's line, stretched nearly straight, the elbow a little low, the hand on the chain pulled taut: the
  // flail trails in a straight line the way she springs from)
  // (her flail arm: the upper arm pointing nearly straight away from you (her hips' right), a little above her shoulder; the elbow bent back so the fist comes
  // round in front of her chest, a little raised. The handle level in it, pointing back toward you, the chain and head trailing after it, away from where she
  // springs, past the left side of her head)
  "wd-turn-away": {
    // (her face pointed up as far as the lean tips it down, so she looks level: her gaze runs along the line the lean tips over)
    hips: 90, shoulders: 160, head: 182.5, lean: 22, pitch: 22, pelvisAlign: 0.7,
    for3d: { arms3: { right: { dirs: [[0.9, 0.2, -0.35], [-0.42, 0.1, 0.9]] }, left: { aim: { dir: [-0.822, -0.546, 0.16], reach: 0.974, bend: [0, -1, 0] } } }, legDirs3: { left: [[-0.1, -0.45, 0.89], [0, -0.85, -0.53]] } },
    // (written in her own frame, which the lean tips: the handle there points a little down so that, leaned, it is level; the chain more so, so that it trails
    // downward toward you)
    flail: { handle: [-0.9, -0.364, 0.45], chain: [-1, -0.728, 0], taut: true },
  },
  "wd-stride": S(-160, -170), // his back to you, spun on his right leg; the arms trail the spin
  "wd-usurp": S(-50, -60), // Wax Arm Back, crouched lower; only his head turns to the flame
  // Clutch Arm (Clutch Flame's rest): hunched, the wax fist gripping the flail's head and pulling it up; in 3D each arm angled out to its own side a little, off
  // the flat drawing's plane.
  "wd-clutch-arm": {
    hips: 0, shoulders: 15,
    for3d: { arms3: { right: { dirs: [[0.416, 0.801, 0.437], [0.399, 0.494, 0.773]] }, left: { dirs: [[-0.174, -0.858, 0.478], [-0.014, 0.641, 0.765]] } } },
  },
  "wd-dead": DEAD,
  "wd-fallen": FALLEN, // staggered (and dead): on a knee, hunched, the head hanging, looking down
  // Wind Up Flail, as the Rest goes through (the sprite's look: its first spin swung round from behind her right, up over her head): hunched low and turned as
  // Flail Spinning Behind is (its hips, chest sideways, legs splayed), the flail arm raised behind her, back and up, the fist a little over her shoulder;
  // the handle up and back from it, and the flail flung on up from its tip over her head and a little ahead. The wax arm bent, its elbow pointing at you,
  // the forearm folded back up so the fist is tucked under her head. From here she settles into Flail Spinning Behind, the flail coming down behind her.
  "wd-wound-up": {
    // (the arch of its swing: the sprite's first spin trail, round her shoulder from low in front of her up and back over)
    hips: 50, shoulders: 90, arch: true,
    for3d: { arms3: { right: { dirs: [[-0.279, 0.25, -0.876], [-0.233, 0.75, -0.589]] }, left: { dirs: [[-0.613, -0.4, 0.514], [0.46, 0.7, -0.386]] } }, splay3: 18 },
    flail: { handle: [-0.245, 0.85, -0.447], chain: [0.469, 0.8, 0.325] },
  },
  "wd-wax-swat": FAN,
  // Usurp Flame's dash: a low lunge at her target, her body leaned far forward over a bent front knee, her wax arm stretched out straight and level from her shoulder at the
  // height of a head kneeling in wax (a staggered waxed's, or yours: about 0.85 m, where the hand is), a little turned in so that it points at the target from her left shoulder,
  // the flail trailing behind her with its head on the floor. (Her hips are 0.6 m up, her feet both on the floor.) Her torso leans 50° forward, not more, her ribcage turned about
  // her spine (`roll3`) so that her wax shoulder is lowered back to the height of the hand's target, her flail shoulder up.
  "wd-usurp-dash": {
    hips: 0, shoulders: 0, pitch: -8, pelvisTurn: 40, skirtDrag: 12, skirtFreeLeftLeg: true, skirtLift: 16,
    flail: { handle: [0.2, -0.3, -0.93], chain: [0, -0.1, -1], rest: true },
    for3d: {
      hip: [47, 80], waist: [57.5, 71.2], neck: [70.4, 60.4], head: [80.4, 50.4], roll3: -44,
      arms3: { right: { dirs: [[0.6, -0.35, -0.7], [0.2, -0.3, -0.93]] }, left: { aim: { dir: [0.1, 0, 1], reach: 1, bend: [0, 1, 0] } } },
      legDirs3: { left: [[-0.05, -0.35, 0.94], [0, -0.8, -0.6]], right: [[0.05, -0.61, -0.79], [0.05, -0.61, -0.79]] },
    },
  },
  "wd-flinch": S(0, 0), // thrown off balance, leaning, not twisting
  // Spin Guard's windup: Flail Spinning Behind (its body, `pose3d`; the flail whirling), but the flail arm brought round to her front, the left of the screen
  // from where you are, reaching out ahead of her chest and a little down, so the whirl spins in front of her; the handle turned well round to her left from
  // out at her right, and the whirl square to it (`spinSquare`), so it stands nearly edge on to you. Her right foot starting to come forward and her left
  // starting to go back (each knee bent forward, as knees do).
  "wd-chain-ready": CHAIN_READY,
  "wd-wax-ready": WAX_READY,
  // Wind Up Flail's windup: Idle (its body, `pose3d`: standing tall, chin up, the flail's head on the floor behind her), beginning to turn: her hips a little
  // further to her right and her chest following a third of the way to Flail Spinning Behind's sideways; the flail arm just drawn back behind her hip, the
  // flail dragging after it; the wax arm bent up before her chest, the elbow low, the fist raised toward her mask.
  "wd-winding-up": {
    hips: 35, shoulders: 30,
    for3d: { arms3: { right: { dirs: [[0, -0.9, -0.4], [-0.077, -0.8, -0.533]] }, left: { dirs: [[0.083, -0.75, 0.645], [0.298, 0.95, 0.117]] } } },
  },
  "wd-clutch-ready": S(0, 20),
  // The viewer's T-poses are turned by the viewer itself
  "wd-t": S(0, 0),
  "wd-t-b": S(0, 0),
};

/** How far his head may turn from his shoulders (degrees): he looks at you over a turned shoulder, as far as his neck lets him. */
const NECK_TURN = 75;


/** A pose lifted into space, and how it is turned. */
export interface WardenRig {
  rig: Rig3;
  /** The flat pose it comes from. */
  flat: WardenSkeleton;
  /** The yaw (radians, to his right) his hips add to the way he faces. */
  yaw: number;
  /** How far his shoulders are turned on his hips (radians, to his right): the rig's `turn3`. */
  turn: number;
  /** Which way his face points, in body space. */
  gaze: P3;
  /** The flail held its own way (`Stance.flail`). */
  flailDirs?: Stance["flail"];
  /** How far his pelvis egg's axis is swung toward his spine (`Stance.pelvisAlign`). */
  pelvisAlign?: number;
  /** How far her bottom egg is turned to her right (`Stance.pelvisTurn`), and how far her skirt hangs back (`Stance.skirtDrag`). */
  pelvisTurn?: number;
  skirtDrag?: number;
  skirtFreeLeftLeg?: boolean;
  hideRightLeg?: boolean;
  skirtSmooth?: boolean;
  skirtRimDrop?: boolean;
  skirtLift?: number;
  /** How far her bottom egg is tipped back (`Stance.pelvisBack`). */
  pelvisBack?: number;
  /** With it tipped back: the line her bottom egg stands along, from her pelvis, as it was before her upper body was pulled back with it. */
  pelvisLift?: P3;
  /** And how far from her pelvis to her waist it was then (meters), which its size goes by. */
  pelvisRun?: number;
}

const cache = new Map<string, WardenRig>();

/**
 * Her shins are this much longer than the rig's (a share of its length) and her thighs this much shorter. Her hips are raised on her body by `HIP_RAISE`
 * (figure units), so her thighs start closer to the belt; what her legs gain beyond that makes her taller.
 */
export const SHIN_LONGER = 1.35, THIGH_SHORTER = 0.92;
/** How far her hips sit up on her body: what her legs gained when her shins were 1.15 of the rig's, kept when they were made longer (so she grew instead). */
const HIP_RAISE = RIG.shin * 0.15 - RIG.thigh * (1 - THIGH_SHORTER);

/**
 * Her legs: each hip raised on her body (`HIP_RAISE`), the thigh hung from it its way (shorter), the shin from the knee its way, longer. Then all of her
 * let down (or up) so the lower foot is as low as it was: a standing leg's foot stays on the floor, her body raised by what her legs gained beyond the hip raise.
 */
function longerShins(rig: Rig3): Rig3 {
  const j = { ...rig.joints }, low = Math.min(j.footR[1], j.footL[1]);
  const raise = HIP_RAISE * U;
  for (const side of ["R", "L"] as const) {
    const hip = j[`hip${side}`], knee = j[`knee${side}`], foot = j[`foot${side}`];
    const hip2: P3 = [hip[0], hip[1] + raise, hip[2]], knee2 = plus(hip2, [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]], THIGH_SHORTER);
    j[`hip${side}`] = hip2;
    j[`knee${side}`] = knee2;
    j[`foot${side}`] = plus(knee2, [foot[0] - knee[0], foot[1] - knee[1], foot[2] - knee[2]], SHIN_LONGER);
  }
  const down = Math.min(j.footR[1], j.footL[1]) - low;
  if (Math.abs(down) > 1e-9) for (const k of JOINTS) j[k] = [j[k][0], j[k][1] - down, j[k][2]];
  return { ...rig, joints: j };
}

/**
 * His arms at their true lengths from the shoulders they hang from. (The lift fits an arm from the neck and then sets its shoulder out to the
 * side and a little lower, which stretches or shortens the upper arm by up to a tenth.) Each bone keeps its direction: the elbow slides along
 * the upper arm, and the forearm follows it.
 */
function trueArms(rig: Rig3): Rig3 {
  const j = { ...rig.joints };
  for (const side of ["R", "L"] as const) {
    const sh = j[`shoulder${side}`], el = j[`elbow${side}`], hd = j[`hand${side}`];
    const u: P3 = [el[0] - sh[0], el[1] - sh[1], el[2] - sh[2]], f: P3 = [hd[0] - el[0], hd[1] - el[1], hd[2] - el[2]];
    const ul = Math.hypot(...u) || 1, fl = Math.hypot(...f) || 1;
    const elbow = plus(sh, u, (RIG.upperArm * U) / ul);
    j[`elbow${side}`] = elbow;
    j[`hand${side}`] = plus(elbow, f, (RIG.forearm * U) / fl);
  }
  return { ...rig, joints: j };
}

/** All of her moved up or down so her lower foot is on the floor. */
function grounded(rig: Rig3): Rig3 {
  const low = Math.min(rig.joints.footR[1], rig.joints.footL[1]);
  if (Math.abs(low) < 1e-9) return rig;
  const j = { ...rig.joints };
  for (const k of JOINTS) j[k] = [j[k][0], j[k][1] - low, j[k][2]];
  return { ...rig, joints: j };
}

/** Her robe's bottom egg: where its middle is along the line from her pelvis to her waist, and how high its upper half reaches (shares of that line's length);
 *  and how far toward each egg's end the spine meets it, from its middle (a share of that half's height): near the top of the bottom egg, the bottom of the
 *  ribcage's. (Render/Warden3D.tsx builds the eggs; the pose needs them to keep her spine its length.) */
export const PELVIS_MIDDLE = 0.5, PELVIS_TOP_HEIGHT = 1, SPINE_IN = 0.75;
const minus3 = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], scale3 = (a: P3, k: number): P3 => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm3 = (a: P3): P3 => scale3(a, 1 / (Math.hypot(...a) || 1));
const cross3 = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Whether a pose name is one of the Warden's. */
export const isWardenPose = (pose: string): pose is WardenPoseName => pose in WARDEN_STANCE;

/** The Warden's pose on the rig (worked out once). */
export function wardenRig(pose: string): WardenRig {
  const name: WardenPoseName = isWardenPose(pose) ? pose : "wd-idle";
  const hit = cache.get(name);
  if (hit) return hit;
  // (A 3D pose of its own may lift another's body: `pose3d`.)
  const flat = WARDEN_POSES[WARDEN_POSES[name].pose3d ?? name], st = WARDEN_STANCE[name];
  // His left leg is the one the rip shows: the lead leg while his candle side is toward you, the rear one otherwise.
  const leadSide: Side = (flat.turn ?? 0) >= 0.5 ? "left" : "right";
  // In space every bone is its true length: the flat poses' stretches (`adjust`: a punch that reaches further, a forearm shortened for the 3/4
  // view) are left to the flat sprites. Each bone keeps the direction its pose gives it.
  const sk: WardenSkeleton = { ...flat, adjust: undefined, leadSide, for3d: { ...flat.for3d, ...st.for3d, turn3: st.shoulders - st.hips } };
  let rig = longerShins(trueArms(liftPose(sk, "right", { freeLegs: true })));
  // Legs pointed their own way (`legDirs3`) set her feet wherever they reach: she is let down (or up) so the lower one stands on the floor.
  if (sk.for3d?.legDirs3) rig = grounded(rig);
  // Her bottom egg tipped back (`pelvisBack`), about her pelvis: where the spine meets it, near its top, goes back with it, and all of her above it (her waist,
  // chest, arms and head) is pulled back as far, so the spine keeps its length. (The egg keeps standing along the line it did before: `pelvisLift`.)
  let pelvisLift: P3 | undefined, pelvisRun: number | undefined;
  if (st.pelvisBack) {
    const J = rig.joints, run = Math.hypot(...minus3(J.waist, J.pelvis)) || 1e-6, lift = scale3(minus3(J.waist, J.pelvis), 1 / run);
    const hipLine = minus3(J.hipR, J.hipL), side = norm3(minus3(hipLine, scale3(lift, dot3(hipLine, lift)))), fwd0 = norm3(cross3(side, lift));
    const tb = rad(st.pelvisBack), tLift = minus3(scale3(lift, Math.cos(tb)), scale3(fwd0, Math.sin(tb)));
    const by = scale3(minus3(tLift, lift), run * (PELVIS_MIDDLE + PELVIS_TOP_HEIGHT * SPINE_IN)), j2 = { ...J };
    for (const k of ["waist", "neck", "head", "shoulderR", "shoulderL", "elbowR", "elbowL", "handR", "handL"] as const) j2[k] = plus(J[k], by, 1);
    rig = { ...rig, joints: j2 };
    pelvisLift = lift;
    pelvisRun = run;
  }
  // His head looks at whoever he fights, as far as his neck allows from his shoulders, chin raised or lowered by the pose's `tilt`.
  const headAbs = st.head ?? Math.max(st.shoulders - NECK_TURN, Math.min(st.shoulders + NECK_TURN, 0)), yaw = rad(headAbs - st.hips), pitch = rad(st.pitch ?? -(flat.tilt ?? 0));
  const gaze: P3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  const made: WardenRig = { rig: { ...rig, gaze }, flat, yaw: rad(st.hips), turn: rad(st.shoulders - st.hips), gaze, flailDirs: st.flail, pelvisAlign: st.pelvisAlign, pelvisTurn: st.pelvisTurn, skirtDrag: st.skirtDrag, skirtFreeLeftLeg: st.skirtFreeLeftLeg, skirtRimDrop: st.skirtRimDrop, hideRightLeg: st.hideRightLeg, skirtSmooth: st.skirtSmooth, skirtLift: st.skirtLift, pelvisBack: st.pelvisBack, pelvisLift, pelvisRun };
  cache.set(name, made);
  return made;
}

/**
 * He stands on the floor at `at`, facing `yaw` (toward whoever he fights) with his hips turned as his pose says, seen through the camera; tipped over as
 * the pose leans (`Stance.lean`): every point, the joints and all that is built on them, is turned about the foot he leans toward as it is seen.
 */
export function placeWarden(pose: string, at: Vec, yaw: number, cam: Cam, w: number, h: number, scale = 1, rise = 0) {
  const wr = wardenRig(pose), base = placeRig(wr.rig, at, yaw + wr.yaw, cam, w, h, scale, rise);
  const lean = isWardenPose(pose) ? WARDEN_STANCE[pose].lean ?? 0 : 0, ahead = isWardenPose(pose) ? WARDEN_STANCE[pose].leanAhead ?? 0 : 0;
  if (!lean && !ahead) return { wr, placed: base };
  // (about the line along his facing through the foot he leans toward: up tips toward his right for a positive lean)
  const j = wr.rig.joints, foot = lean > 0 ? (j.footR[0] > j.footL[0] ? j.footR : j.footL) : (j.footR[0] < j.footL[0] ? j.footR : j.footL);
  const c = Math.cos(rad(lean)), s = Math.sin(rad(lean));
  const roll = (p: P3): P3 => { const x = p[0] - foot[0], y = p[1] - foot[1]; return [foot[0] + x * c + y * s, foot[1] - x * s + y * c, p[2]]; };
  // (tipped forward too, `leanAhead`: about the line across her through the foot further ahead, her top going the way she faces)
  const front = ahead >= 0 ? (j.footR[2] > j.footL[2] ? j.footR : j.footL) : (j.footR[2] < j.footL[2] ? j.footR : j.footL), ca = Math.cos(rad(ahead)), sa = Math.sin(rad(ahead));
  const pitchOver = (p: P3): P3 => { const z = p[2] - front[2], y = p[1] - front[1]; return [p[0], front[1] - z * sa + y * ca, front[2] + z * ca + y * sa]; };
  const tip = (p: P3): P3 => (ahead ? pitchOver(roll(p)) : roll(p));
  const see = (p: P3) => base.see(tip(p));
  const seen = Object.fromEntries(JOINTS.map(k => [k, see(j[k])])) as typeof base.seen;
  /** A point that lies on the floor (the flail's head resting there) stays on it: where to put it so that, tipped, it is back down at its height. */
  const grounded = (p: P3): P3 => {
    const t = tip(p), x = t[0] - foot[0], y = p[1] - foot[1];
    return [foot[0] + x * c - y * s, foot[1] + x * s + y * c, p[2]];
  };
  return { wr, placed: { ...base, see, seen, grounded, prop: wr.rig.prop && { kind: wr.rig.prop.kind, at: see(wr.rig.prop.at) }, origin: see([0, 0, 0]) } };
}

/**
 * The flail's handle is this long (figure units), held at its middle (as the flat figure's); its chain runs this far from the handle's tip to the
 * middle of its head: the whirl's length (34, as far as the spin's chain runs) and the head's radius beyond it, so a hanging chain shows as many
 * links as a whirling one. (The flat figure's is 34 to the head's middle.)
 */
const HANDLE_HALF = 15, CHAIN = 40;
/** The chain's length (figure units, the handle's tip to the head's middle). */
export const FLAIL_CHAIN = CHAIN;
/** How high the head's middle is when it rests on the floor (figure units). */
const HEAD_REST = 6;

/** The flail in space: the handle's ends, where the head hangs (or is held), and whether it lies on the floor; `grip`: where his candle hand holds the chain. */
export interface Flail3 { butt: P3; tip: P3; ball: P3; resting: boolean; grip?: P3 }

const plus = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The flail in his hand: the handle at the flat pose's angle (turned with his shoulders), the head where that pose hangs or holds it. */
export function flail3(wr: WardenRig): Flail3 {
  const { rig, flat, turn } = wr, j = rig.joints, hand = j.handR;
  // A way in the flat pose's side plane (ahead, down), turned with his shoulders into space.
  const lift = (dx: number, dy: number): P3 => [dx * Math.sin(turn), -dy, dx * Math.cos(turn)];
  const [hx, hy] = flat.weaponArm.hand;
  // (The 3D figure may hold it otherwise than the flat pose: `flail3d`.)
  const at = flat.flail3d?.ball ?? flat.ball;
  const deg = flat.flail3d?.handle ?? flat.handle ?? (Math.atan2(at[1] - hy, at[0] - hx) * 180) / Math.PI;
  const dir = lift(Math.cos(rad(deg)), Math.sin(rad(deg)));
  // (held where the pose says, `handleGrip` from the handle's middle: the handle slides through the hand)
  const g = flat.handleGrip ?? 0;
  // Held its own way (`Stance.flail`): the handle and the chain each straight along the way given, the head the chain's length on.
  if (wr.flailDirs) {
    const unit3 = (v: P3): P3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
    const hd = unit3(wr.flailDirs.handle), cd = unit3(wr.flailDirs.chain);
    const tip3 = plus(hand, hd, (HANDLE_HALF - g) * U), butt3 = plus(hand, hd, -(HANDLE_HALF + g) * U);
    const held = wr.flailDirs.taut ? Math.max(0, CHAIN - Math.hypot(...[0, 1, 2].map(i => j.handL[i] - tip3[i])) / U) : wr.flailDirs.held;
    if (held !== undefined) return { butt: butt3, tip: tip3, grip: j.handL, ball: plus(j.handL, cd, held * U), resting: false };
    if (wr.flailDirs.rest) {
      // (the head on the floor, the chain along it from under the handle's tip, the way `chain` runs over the floor)
      const floor = HEAD_REST * U, drop = Math.max(0, tip3[1] - floor), run = Math.sqrt(Math.max(0, (CHAIN * U) ** 2 - drop * drop)), flatLen = Math.hypot(cd[0], cd[2]) || 1;
      return { butt: butt3, tip: tip3, ball: [tip3[0] + (cd[0] / flatLen) * run, floor, tip3[2] + (cd[2] / flatLen) * run], resting: true };
    }
    const ball3 = plus(tip3, cd, CHAIN * U);
    if (ball3[1] >= HEAD_REST * U) return { butt: butt3, tip: tip3, ball: ball3, resting: false };
  }
  const tip = plus(hand, dir, (HANDLE_HALF - g) * U), butt = plus(hand, dir, -(HANDLE_HALF + g) * U);
  const left = j.handL;
  if (flat.chainInHand) return { butt, tip, ball: plus(left, [0, -1, 0], (flat.headBehindArm ? 16 : 12) * U), resting: false };
  if (flat.headInHand) return { butt, tip, ball: plus(left, [0, -1, 0], 6 * U), resting: false };
  if (flat.held) return { butt, tip, ball: plus(hand, lift(at[0] - hx, at[1] - hy), U), resting: false };
  // Hanging from the tip toward where the pose has the head, the chain's length.
  const tipFlat: [number, number] = [hx + Math.cos(rad(deg)) * (HANDLE_HALF - g), hy + Math.sin(rad(deg)) * (HANDLE_HALF - g)];
  const vx = at[0] - tipFlat[0], vy = at[1] - tipFlat[1], len = Math.hypot(vx, vy);
  const way = len > 0.01 ? lift(vx / len, vy / len) : lift(0, 1);
  let ball = plus(tip, way, CHAIN * U);
  const floor = HEAD_REST * U;
  if (ball[1] >= floor) return { butt, tip, ball, resting: false };
  // Resting on the floor: the chain lies along it, as far as its length goes.
  const drop = Math.max(0, tip[1] - floor), run = Math.sqrt(Math.max(0, (CHAIN * U) ** 2 - drop * drop));
  const flatLen = Math.hypot(way[0], way[2]) || 1;
  // (swung round along the floor as the pose says, `flail3d.lay`: turned about the upright, so a chain lying behind him swings toward his left)
  const lay = rad(flat.flail3d?.lay ?? 0), hx3 = way[0] / flatLen, hz3 = way[2] / flatLen;
  const gx = hx3 * Math.cos(lay) + hz3 * Math.sin(lay), gz = hz3 * Math.cos(lay) - hx3 * Math.sin(lay);
  ball = [tip[0] + gx * run, floor, tip[2] + gz * run];
  return { butt, tip, ball, resting: true };
}

/** The radius of his candle fist, a ball of wax (figure units). */
export const CANDLE_FIST = 5.4;

/**
 * Where the flame on his candle hand stands (body space): the little flame at the very tip of the fist, past the hand along the forearm, moved as the
 * stance says (`flameAt`); in his second form (`centered`), the red flame in the middle of the fist. The 3D figure draws it there and the scene lights from it.
 */
export function wardenFlame(wr: WardenRig, centered: boolean): P3 {
  const j = wr.rig.joints, hand = j.handL;
  if (centered) return hand;
  const [fa, fu, fr] = wr.flat.flameAt ?? [0, 0, 0], f = [hand[0] - j.elbowL[0], hand[1] - j.elbowL[1], hand[2] - j.elbowL[2]] as P3, l = Math.hypot(...f) || 1;
  const side: P3 = [Math.cos(wr.turn), 0, -Math.sin(wr.turn)];
  return plus(plus(plus(hand, f, ((CANDLE_FIST + fa) * U) / l), [0, 1, 0], fu * U), side, fr * U);
}

/** Where a blow of his lands from: his flail's head for the Slam, else his candle fist (body space). */
export function wardenFist(pose: string): P3 {
  const wr = wardenRig(pose);
  return wr.flat.slamTrail ? flail3(wr).ball : wr.rig.joints.handL;
}
