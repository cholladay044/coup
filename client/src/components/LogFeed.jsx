import { useEffect, useRef } from 'react';

const TURN_PATTERN = /'s turn\.$/;
const CHALLENGE_DECLARED_PATTERN = /challenges .+'s claim of/;
const CHALLENGE_FAILED_PATTERN = /the challenge fails\.$/;
const CHALLENGE_SUCCEEDED_PATTERN = /the challenge succeeds\.$/;
// Connection events read as system notices rather than gameplay, so they share one neutral
// style. "…turn skipped." and "…now their turn." are the wordier variants of the same events.
const DISCONNECT_PATTERN = /(disconnected\.|is disconnected — turn skipped\.|left the game — .+ wins by default\.)$/;
const RECONNECT_PATTERN = /reconnected(\.| — it's now their turn\.)$/;

// Icons back up the color-coding so the log stays scannable for colorblind readers, not
// just readers of the full sentence.
function entryMeta(message) {
  if (DISCONNECT_PATTERN.test(message)) return { className: 'log-entry-system', icon: '⚠' };
  if (RECONNECT_PATTERN.test(message)) return { className: 'log-entry-system', icon: '↩' };
  if (TURN_PATTERN.test(message)) return { className: 'log-entry-turn', icon: '▶' };
  if (CHALLENGE_SUCCEEDED_PATTERN.test(message)) {
    return { className: 'log-entry-challenge log-entry-challenge-succeeded', icon: '✕' };
  }
  if (CHALLENGE_FAILED_PATTERN.test(message)) {
    return { className: 'log-entry-challenge log-entry-challenge-failed', icon: '✓' };
  }
  if (CHALLENGE_DECLARED_PATTERN.test(message)) return { className: 'log-entry-challenge', icon: '⚔' };
  return { className: '', icon: null };
}

export default function LogFeed({ log }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  return (
    <div className="log-panel">
      <h4 className="log-title">Activity Log</h4>
      <div className="log-feed" ref={ref}>
        {log.map((entry) => {
          const { className, icon } = entryMeta(entry.message);
          return (
            <div key={entry.id} className={`log-entry ${className}`}>
              {icon && <span className="log-entry-icon" aria-hidden="true">{icon}</span>}
              {entry.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
