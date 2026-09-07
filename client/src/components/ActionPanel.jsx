import { useEffect, useState } from 'react';
import { ACTION_INFO, ACTION_CLAIM } from '../characters';

const TARGETED_ACTIONS = new Set(['coup', 'assassinate', 'steal']);

export default function ActionPanel({ myPlayer, opponents, onDeclare, forcedCoup, onPreviewAction }) {
  const [choosingTarget, setChoosingTarget] = useState(null);

  // keep the claimed card glowing through the target-selection step
  useEffect(() => {
    onPreviewAction?.(choosingTarget ? ACTION_CLAIM[choosingTarget] || null : null);
    return () => onPreviewAction?.(null);
  }, [choosingTarget, onPreviewAction]);

  const actions = forcedCoup ? ['coup'] : ['income', 'foreign_aid', 'coup', 'tax', 'assassinate', 'steal', 'exchange'];

  function handleActionClick(type) {
    if (TARGETED_ACTIONS.has(type)) {
      setChoosingTarget(type);
    } else {
      onDeclare(type, null);
    }
  }

  function affordable(type) {
    const cost = { coup: 7, assassinate: 3 }[type] || 0;
    return myPlayer.coins >= cost;
  }

  function isBluff(type) {
    const claim = ACTION_CLAIM[type];
    if (!claim) return false;
    return !myPlayer.cards.some((c) => !c.revealed && c.type === claim);
  }

  if (choosingTarget) {
    return (
      <div className="action-panel">
        <h3>Choose a target for {ACTION_INFO[choosingTarget].label}</h3>
        <div className="target-list">
          {opponents.map((p) => (
            <button key={p.id} className="target-btn" onClick={() => { onDeclare(choosingTarget, p.id); setChoosingTarget(null); }}>
              {p.name}
            </button>
          ))}
        </div>
        <button className="secondary" onClick={() => setChoosingTarget(null)}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="action-panel">
      <h3>{forcedCoup ? 'You have 10+ coins — you must Coup' : 'Your turn — choose an action'}</h3>
      <div className="action-grid">
        {actions.map((type) => (
          <button
            key={type}
            className={`action-btn ${isBluff(type) ? 'bluff' : ''}`}
            disabled={!affordable(type)}
            title={isBluff(type) ? `${ACTION_INFO[type].desc} You don't hold ${ACTION_CLAIM[type]} — this would be a bluff.` : ACTION_INFO[type].desc}
            onClick={() => handleActionClick(type)}
            onMouseEnter={() => onPreviewAction?.(ACTION_CLAIM[type] || null)}
            onMouseLeave={() => onPreviewAction?.(null)}
          >
            <span className="action-label">
              {ACTION_INFO[type].label}
              {isBluff(type) && <span className="bluff-tag">bluff</span>}
            </span>
            <span className="action-desc">{ACTION_INFO[type].desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
