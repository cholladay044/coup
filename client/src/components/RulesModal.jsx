import { useEffect, useState } from 'react';
import { CHARACTER_INFO, ACTION_INFO } from '../characters';

export default function RulesModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button className="rules-fab" onClick={() => setOpen(true)} aria-label="How to play" title="How to play">
        ?
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal rules-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rules-header">
              <h3>How to Play Coup</h3>
              <button className="rules-close" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            <div className="rules-body">
              <section>
                <h4>Objective</h4>
                <p>
                  Everyone starts with 2 coins and 2 face-down influence cards. Take actions to gain coins and force
                  opponents to lose influence. The last player with any influence left wins.
                </p>
              </section>

              <section>
                <h4>Bluffing &amp; Challenges</h4>
                <p>
                  You may claim any character's action on your turn, whether you hold that card or not. Any opponent
                  can challenge your claim. If you can't reveal a matching card, you lose an influence; if you can,
                  the challenger loses one instead. Losing both influence cards eliminates you.
                </p>
              </section>

              <section>
                <h4>Actions</h4>
                <ul className="rules-list">
                  {Object.entries(ACTION_INFO).map(([type, info]) => (
                    <li key={type}>
                      <strong>{info.label}</strong> — {info.desc}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4>Characters</h4>
                <ul className="rules-list">
                  {Object.entries(CHARACTER_INFO).map(([name, info]) => (
                    <li key={name}>
                      <strong style={{ color: info.color }}>{name}</strong> — {info.ability}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4>Forced Coup</h4>
                <p>If you start your turn with 10 or more coins, you must Coup.</p>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
