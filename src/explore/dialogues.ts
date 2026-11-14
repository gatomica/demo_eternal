/**
 * dialogues.ts — what the guide says, scene by scene. A conversation is a run of beats played in order in the
 * dialogue scene (`DialogueScene.tsx`): lines the guide speaks (E moves on), a question you answer (its answers stand
 * between you, like the menu; each answer has beats of its own, played next), the guide's menu, or a gift (its pop-up;
 * the talk waits until it is closed). When the beats run out, the scene closes.
 */

export type Beat =
  /** The guide speaks these lines, one after the other. */
  | { say: string[] }
  /** You answer: the beats of the answer you pick are played next, then the talk goes on. No can't skip it. */
  | { ask: { label: string; beats: Beat[] }[] }
  /**
   * The guide's menu: Talk, Sleep, Empower Self, Dreams, Leave. The talk stays here until you sleep or leave.
   * `only`: just Sleep (the opening talk: there is nothing else to do yet, and no leaving it). `page`: it opens right on Dreams or
   * Empower Self (No goes back to the menu).
   */
  | { menu: true; only?: "sleep"; page?: "dreams" | "empower" }
  /** The guide gives you something: its pop-up comes up, and the talk goes on once it is closed. */
  | { gift: "knot" }
  /** The end of the demo: the screen fades, very slowly, to black, and "Thanks for playing" comes up. */
  | { end: true };

export interface Conversation {
  id: string;
  beats: Beat[];
}

/** Just the guide's menu: speaking with it by a keeper. */
export const MENU: Conversation = { id: "menu", beats: [{ menu: true }] };

/** A new game opens here: the guide has woken you. */
export const WAKE: Conversation = {
  id: "wake",
  beats: [
    {
      say: [
        "Forgive me. I did not mean to disturb your sleep.",
        "It has been so long since I last found a sound mind.",
        "You need not rise yet. Lay with me a while, if you'd like.",
      ],
    },
    { menu: true, only: "sleep" },
  ],
};

/** The first time you try to leave the room you woke in: the guide stops you, and asks you back. */
export const DOORWAY: Conversation = {
  id: "doorway",
  beats: [
    {
      say: [
        "Wait. Please.",
        "The world is not as you remember it. Not since you fell asleep.",
        "Come back. Dream with me again.",
      ],
    },
    { menu: true },
  ],
};

/** The second time you try to leave it (whether you lay with the guide again or not): it lets you go. */
export const LET_GO: Conversation = {
  id: "let-go",
  beats: [
    {
      say: [
        "You would go, still?",
        "I understand, just...",
        "Whether you need to lay down, or rise again...",
        "I will be here.",
      ],
    },
  ],
};

/** The first time you speak with the guide at the first floor's safe spot, past the ladder: will you go on? Either way, the knot. */
export const PERSIST: Conversation = {
  id: "persist",
  beats: [
    {
      say: [
        "...",
        "A willpower like yours I haven't seen in a long time.",
        "Alas... I'm afraid it is but a futile endeavor.",
        "There is nothing for you up there. Nothing for anyone.",
        "Will you rise, even so?",
      ],
    },
    {
      ask: [
        {
          label: "Yes",
          beats: [
            { say: ["Then you will need this."] },
            { gift: "knot" },
          ],
        },
        {
          label: "No",
          beats: [
            { say: ["I am glad... Truly.", "Still... to ease my worries, take this"] },
            { gift: "knot" },
          ],
        },
      ],
    },
    { say: ["Should you fall, this knot will untangle in your place.",
      "Lay with me... and I'll knot it once again.",
      "Be safe... please.",
    ]},
    { menu: true },
  ],
};

/** The first time you come to the guide with a memory whose dreams are unread: it is curious, and offers to read it. Then Dreams. */
export const DREAMS_TALK: Conversation = {
  id: "dreams",
  beats: [
    {
      say: [
        "It saddens me to see a lost dream...",
        "Let me read it for you. We shall make them come true...",
      ],
    },
    { menu: true, page: "dreams" },
  ],
};

/** The first time you come to the guide with String enough to raise a stat: it offers to wind it into you. Then Empower Self. */
export const STRING_TALK: Conversation = {
  id: "string",
  beats: [
    {
      say: [
        "A copious amount of lost string you've gathered...",
        "Be careful not to fall and lose it yourself.",
        "Let me wind it around you instead. Its memories, its strength, would be yours to keep.",
      ],
    },
    { menu: true, page: "empower" },
  ],
};

/** Accepting the guide's last offer: you lie down with it, and the demo ends. */
const SLEEP_FOR_GOOD: Beat[] = [{ say: ["Then close your eyes. Rest now."] }, { end: true }];

/** The first time you speak with the guide at the end of the last corridor, at the foot of the wall of wax: its last offer. */
export const FINAL: Conversation = {
  id: "final",
  beats: [
    {
      say: [
        "So now you have seen it for yourself. There was no escape. There never was.",
        "And yet, you kept your hope.",
        "...",
        "Let me answer in kind...",
        "If you cannot rise, go deeper still.",
        "I can take you there.",
        "All you need to do is lay with me, and sleep of an unbound horizon.",
      ],
    },
    { say: ["Let ourselves dream, one last time?"] },
    {
      ask: [
        { label: "Accept", beats: SLEEP_FOR_GOOD },
        { label: "Refuse", beats: [{ say: ["I am glad you have kept a sound mind...", "But I will always be here, should you change your mind."] }] },
      ],
    },
    { menu: true },
  ],
};

/** Talk, from the guide's menu, once it has made its last offer: the offer again (the menu follows). */
export const OFFER: Beat[] = [
  { say: ["Let ourselves dream, one last time?"] },
  {
    ask: [
      { label: "Accept", beats: SLEEP_FOR_GOOD },
      { label: "Refuse", beats: [{ say: ["Then I will wait." , "I will always be here, should you change your mind."] }] },
    ],
  },
];

/** Talk, from the guide's menu (before its last offer, and when it has nothing waiting to bring up): this, then back to the menu. */
export const CHAT: string[] = [
  "Should you fall, I will always bring you back here. Always.",
];
