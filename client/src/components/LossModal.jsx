import CardView from './CardView';

export default function LossModal({ pendingLoss, myPlayer, playersById, playerId, onChooseLoss }) {
  const isMe = pendingLoss.playerId === playerId;
  const unrevealed = isMe ? myPlayer.cards.filter((c) => !c.revealed) : [];

  return (
    <div className="modal-overlay">
      <div className="modal">
        {isMe ? (
          <>
            <h3>Choose an influence to give up</h3>
            <p className="waiting-text">{pendingLoss.reason}</p>
            <div className="card-choice-row">
              {unrevealed.map((c) => (
                <button key={c.id} className="card-choice" onClick={() => onChooseLoss(c.id)}>
                  <CardView card={c} />
                </button>
              ))}
            </div>
          </>
        ) : (
          <h3>{playersById[pendingLoss.playerId]?.name} is choosing an influence to give up…</h3>
        )}
      </div>
    </div>
  );
}
