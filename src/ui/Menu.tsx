/**
 * Menu.tsx — a column of menu buttons, one of them focused (the keys move the focus, and so does
 * the mouse), and the pause menu built from them.
 */

export interface MenuOption {
  label: string;
  run: () => void;
}

export function MenuButtons({ options, focus, onFocus }: { options: MenuOption[]; focus: number; onFocus: (i: number) => void }) {
  return (
    <>
      {options.map((o, i) => (
        <button
          key={o.label}
          className={`menu-button ${i === focus ? "is-focused" : ""}`}
          onMouseEnter={() => onFocus(i)}
          onClick={o.run}
        >
          {o.label}
        </button>
      ))}
    </>
  );
}

/** The pause menu, over whatever is paused. */
export function PauseMenu(props: { options: MenuOption[]; focus: number; onFocus: (i: number) => void }) {
  return (
    <div className="result" role="dialog" aria-label="Paused">
      <nav className="pause-menu">
        <MenuButtons {...props} />
      </nav>
    </div>
  );
}
