import { ACTION_INFO } from '../characters';

export default function ResponsePanel({ pendingAction, playersById, playerId, onPass, onChallenge, onBlock }) {
  const pa = pendingAction;
  const actor = playersById[pa.actorId];
  const target = pa.targetId ? playersById[pa.targetId] : null;
  // Eliminated players are out of the game and must never be asked to act. The server
  // already leaves them out of `eligibleResponderIds`, so this is defence in depth rather
  // than something reachable today — but it keeps the panel honest on its own terms
  // instead of trusting the server completely.
  const me = playersById[playerId];
  const stillInPlay = (id) => !playersById[id]?.eliminated;
  const iAmEligible =
    !me?.eliminated && pa.eligibleResponderIds.includes(playerId) && !pa.respondedIds.includes(playerId);
  const waitingOn = pa.eligibleResponderIds
    .filter((id) => !pa.respondedIds.includes(id) && stillInPlay(id))
    .map((id) => playersById[id]?.name);

  if (pa.phase === 'exchange-selection') {
    return (
      <div className="response-panel">
        <h3>{actor.name} is exchanging cards with the court deck…</h3>
      </div>
    );
  }

  if (pa.phase === 'action-challenge') {
    return (
      <div className="response-panel">
        <h3>
          {actor.name} claims <strong>{pa.claim}</strong> to use {ACTION_INFO[pa.type].label}
          {target ? ` on ${target.name}` : ''}.
        </h3>
        {iAmEligible ? (
          <div className="response-buttons">
            <button className="danger" onClick={onChallenge}>
              Challenge
            </button>
            <button className="secondary" onClick={onPass}>
              Allow
            </button>
          </div>
        ) : (
          <p className="waiting-text">Waiting on: {waitingOn.join(', ') || '…'}</p>
        )}
      </div>
    );
  }

  if (pa.phase === 'block-window') {
    return (
      <div className="response-panel">
        <h3>
          {actor.name} used {ACTION_INFO[pa.type].label}
          {target ? ` on ${target.name}` : ''}. Will anyone block?
        </h3>
        {iAmEligible ? (
          <div className="response-buttons">
            {pa.blockedBy.map((character) => (
              <button key={character} className="danger" onClick={() => onBlock(character)}>
                Block with {character}
              </button>
            ))}
            <button className="secondary" onClick={onPass}>
              Allow
            </button>
          </div>
        ) : (
          <p className="waiting-text">Waiting on: {waitingOn.join(', ') || '…'}</p>
        )}
      </div>
    );
  }

  if (pa.phase === 'block-challenge') {
    const blocker = playersById[pa.blockerId];
    return (
      <div className="response-panel">
        <h3>
          {blocker.name} claims <strong>{pa.blockClaim}</strong> to block.
        </h3>
        {iAmEligible ? (
          <div className="response-buttons">
            <button className="danger" onClick={onChallenge}>
              Challenge the Block
            </button>
            <button className="secondary" onClick={onPass}>
              Allow the Block
            </button>
          </div>
        ) : (
          <p className="waiting-text">Waiting on: {waitingOn.join(', ') || '…'}</p>
        )}
      </div>
    );
  }

  return null;
}
