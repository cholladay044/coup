import { useState } from 'react';

export default function Home({ onCreate, onJoin, error }) {
  const [name, setName] = useState(() => localStorage.getItem('coup:name') || '');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState('create');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    localStorage.setItem('coup:name', trimmed);
    setBusy(true);
    try {
      if (mode === 'create') await onCreate(trimmed);
      else await onJoin(code.trim().toUpperCase(), trimmed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen home-screen">
      <h1 className="title">Coup</h1>
      <p className="subtitle">Bluff, deceive, and eliminate the court.</p>

      <div className="mode-toggle">
        <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>
          Create Room
        </button>
        <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>
          Join Room
        </button>
      </div>

      <form className="home-form" onSubmit={handleSubmit}>
        <label>
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Enter a name"
            autoFocus
          />
        </label>

        {mode === 'join' && (
          <label>
            Room code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={4}
              placeholder="ABCD"
              style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}
            />
          </label>
        )}

        {error && <div className="error-text">{error}</div>}

        <button type="submit" className="primary" disabled={busy || !name.trim() || (mode === 'join' && code.trim().length !== 4)}>
          {mode === 'create' ? 'Create Room' : 'Join Room'}
        </button>
      </form>
    </div>
  );
}
