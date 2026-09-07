import { useEffect, useState } from 'react';

// Shown to whoever is left when everyone else has disconnected: the game ends in their
// favour once the grace period expires, so tell them that's happening rather than leaving
// them on a board nobody can act on.
//
// The caller keys this on `forfeitInMs`, so a new value from the server remounts the
// component with correct initial state rather than needing a reset inside an effect.
export default function ForfeitNotice({ forfeitInMs, absentNames, canExtend, onExtend }) {
  const [remainingMs, setRemainingMs] = useState(forfeitInMs ?? 0);

  useEffect(() => {
    if (forfeitInMs == null) return undefined;
    // The server sends time *remaining* rather than a timestamp, so anchor it to our own
    // clock here — that keeps the countdown right even if the two clocks disagree.
    const deadline = Date.now() + forfeitInMs;
    const id = setInterval(() => setRemainingMs(Math.max(0, deadline - Date.now())), 250);
    return () => clearInterval(id);
  }, [forfeitInMs]);

  if (forfeitInMs == null) return null;

  const seconds = Math.ceil(remainingMs / 1000);
  const who = absentNames.length === 1 ? absentNames[0] : `${absentNames.length} players`;

  return (
    <div className="forfeit-notice" role="status">
      <span className="forfeit-notice-icon" aria-hidden="true">⚠</span>
      <span className="forfeit-notice-text">
        Waiting for <strong>{who}</strong> to reconnect…{' '}
        <strong className="forfeit-countdown">{seconds}s</strong>
        <span className="forfeit-notice-sub">
          {canExtend
            ? "You win by default if they don't return."
            : "Maximum wait reached — you win by default if they don't return."}
        </span>
      </span>
      <button className="secondary forfeit-extend" onClick={onExtend} disabled={!canExtend}>
        {canExtend ? 'Give them more time' : 'Max wait reached'}
      </button>
    </div>
  );
}
