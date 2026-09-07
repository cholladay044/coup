import { CHARACTER_INFO } from '../characters';

export default function CardView({ card, faceDown, small, claimed }) {
  if (faceDown || !card.type) {
    return <div className={`card face-down ${small ? 'small' : ''}`}>?</div>;
  }
  const info = CHARACTER_INFO[card.type];
  return (
    <div
      className={`card ${card.revealed ? 'revealed' : ''} ${small ? 'small' : ''} ${claimed ? 'claimed' : ''}`}
      style={{ '--card-color': info?.color || '#555' }}
      title={info?.ability}
    >
      <span className="card-name">{card.type}</span>
      <span className="card-action">{info?.action}</span>
    </div>
  );
}
