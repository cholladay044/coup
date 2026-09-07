import { useState } from 'react';
import CardView from './CardView';

export default function ExchangeModal({ exchangePool, keepCount, onSubmit }) {
  const [selected, setSelected] = useState([]);

  function toggle(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= keepCount) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Choose {keepCount} card(s) to keep</h3>
        <div className="card-choice-row">
          {exchangePool.map((c) => (
            <button
              key={c.id}
              className={`card-choice ${selected.includes(c.id) ? 'selected' : ''}`}
              onClick={() => toggle(c.id)}
            >
              <CardView card={c} />
            </button>
          ))}
        </div>
        <button className="primary" disabled={selected.length !== keepCount} onClick={() => onSubmit(selected)}>
          Confirm
        </button>
      </div>
    </div>
  );
}
