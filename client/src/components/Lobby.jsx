export default function Lobby({ lobby, playerId, onStart, onLeave, error }) {
  const isHost = lobby.hostId === playerId;
  const canStart = lobby.players.length >= 2;

  return (
    <div className="screen lobby-screen">
      <h1 className="title">Coup</h1>
      <div className="room-code-box">
        <span>Room Code</span>
        <strong>{lobby.code}</strong>
      </div>
      <p className="subtitle">Share this code with friends to have them join.</p>

      <ul className="player-list">
        {lobby.players.map((p) => (
          <li key={p.id} className={!p.connected ? 'disconnected' : ''}>
            <span>{p.name}</span>
            {p.id === lobby.hostId && <span className="badge">Host</span>}
            {p.id === playerId && <span className="badge you">You</span>}
            {!p.connected && <span className="badge">Offline</span>}
          </li>
        ))}
      </ul>

      {error && <div className="error-text">{error}</div>}

      {isHost ? (
        <button className="primary" disabled={!canStart} onClick={onStart}>
          {canStart ? 'Start Game' : 'Need at least 2 players'}
        </button>
      ) : (
        <p className="waiting-text">Waiting for the host to start the game…</p>
      )}

      <button className="secondary lobby-leave" onClick={onLeave}>
        Leave Lobby
      </button>
    </div>
  );
}
