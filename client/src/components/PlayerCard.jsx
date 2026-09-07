import CardView from './CardView';

export default function PlayerCard({ player, isSelf, isTurn, isTargetable, onTarget, pendingAction, previewClaim }) {
  const claimedCharacter =
    pendingAction?.actorId === player.id
      ? pendingAction.claim
      : pendingAction?.blockerId === player.id
        ? pendingAction.blockClaim
        : previewClaim || null;

  const isBluffedClaim =
    isSelf && claimedCharacter && !player.cards.some((c) => !c.revealed && c.type === claimedCharacter);

  return (
    <div
      className={[
        'player-card',
        isTurn ? 'is-turn' : '',
        player.eliminated ? 'eliminated' : '',
        !player.connected ? 'disconnected' : '',
        isTargetable ? 'targetable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={isTargetable ? () => onTarget(player.id) : undefined}
    >
      <div className="player-card-header">
        <span className="player-name">
          {player.name} {isSelf && <span className="you-tag">(you)</span>}
        </span>
        <span className="coins">{player.coins} coins</span>
      </div>
      <div className="cards-row">
        {player.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            faceDown={!c.revealed && !isSelf}
            small
            claimed={c.type === claimedCharacter && (isSelf || c.revealed)}
          />
        ))}
        {isBluffedClaim && (
          <div className="card ghost-claim small" title={`You're claiming ${claimedCharacter} but don't hold that card.`}>
            <span className="card-name">{claimedCharacter}</span>
            <span className="bluff-tag">bluff</span>
          </div>
        )}
      </div>
      {player.eliminated && <div className="eliminated-tag">Eliminated</div>}
      {!player.connected && <div className="eliminated-tag">Disconnected</div>}
      {isTurn && !player.eliminated && <div className="turn-tag">Current Turn</div>}
    </div>
  );
}
