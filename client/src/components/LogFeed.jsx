import { useEffect, useRef } from 'react';

const TURN_PATTERN = /'s turn\.$/;

export default function LogFeed({ log }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [log]);

  return (
    <div className="log-panel">
      <h4 className="log-title">Activity Log</h4>
      <div className="log-feed" ref={ref}>
        {log.map((entry) => (
          <div key={entry.id} className={`log-entry ${TURN_PATTERN.test(entry.message) ? 'log-entry-turn' : ''}`}>
            {entry.message}
          </div>
        ))}
      </div>
    </div>
  );
}
