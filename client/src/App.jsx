import { useEffect, useState, useCallback } from 'react';
import { socket, emitAsync } from './socket';
import Home from './components/Home';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import RulesModal from './components/RulesModal';
import './App.css';

// True when the game is waiting on this specific player to do something: it's their turn
// with no action declared yet, they're an un-responded eligible challenger/blocker, they
// need to choose a card to lose, or they're the one exchanging cards.
function playerNeedsAttention(gameState, playerId) {
  if (!gameState || gameState.phase !== 'playing' || !playerId) return false;
  if (gameState.pendingLoss) return gameState.pendingLoss.playerId === playerId;
  const pa = gameState.pendingAction;
  if (pa) {
    if (pa.phase === 'exchange-selection') return pa.actorId === playerId;
    return pa.eligibleResponderIds.includes(playerId) && !pa.respondedIds.includes(playerId);
  }
  return gameState.currentPlayerId === playerId;
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [playerId, setPlayerId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [lobby, setLobby] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    function onLobbyState(state) {
      setLobby(state);
      setScreen('lobby');
    }
    function onGameState(state) {
      setGameState(state);
      setScreen('game');
    }
    socket.on('lobby:state', onLobbyState);
    socket.on('game:state', onGameState);
    return () => {
      socket.off('lobby:state', onLobbyState);
      socket.off('game:state', onGameState);
    };
  }, []);

  // Nudge the tab title when it's this player's turn to act or respond, so it's noticeable
  // while alt-tabbed (most of a multiplayer game is spent waiting on other players).
  useEffect(() => {
    document.title = screen === 'game' && playerNeedsAttention(gameState, playerId) ? 'Your turn! — Coup' : 'Coup';
  }, [gameState, playerId, screen]);

  // attempt to rejoin an in-progress session after a refresh
  useEffect(() => {
    const saved = localStorage.getItem('coup:session');
    if (!saved) return;
    const { roomCode: code, playerId: pid } = JSON.parse(saved);
    emitAsync('room:rejoin', { code, playerId: pid })
      .then(() => {
        setRoomCode(code);
        setPlayerId(pid);
      })
      .catch(() => localStorage.removeItem('coup:session'));
  }, []);

  function saveSession(code, pid) {
    localStorage.setItem('coup:session', JSON.stringify({ roomCode: code, playerId: pid }));
  }

  const handleBackToHome = useCallback(() => {
    localStorage.removeItem('coup:session');
    socket.disconnect();
    socket.connect();
    setScreen('home');
    setPlayerId(null);
    setRoomCode(null);
    setLobby(null);
    setGameState(null);
    setError('');
  }, []);

  const handleCreate = useCallback(async (name) => {
    setError('');
    try {
      const res = await emitAsync('room:create', { name });
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      saveSession(res.roomCode, res.playerId);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleJoin = useCallback(async (code, name) => {
    setError('');
    try {
      const res = await emitAsync('room:join', { code, name });
      setRoomCode(res.roomCode);
      setPlayerId(res.playerId);
      saveSession(res.roomCode, res.playerId);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const handleStart = useCallback(async () => {
    setError('');
    try {
      await emitAsync('room:start');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const gameAction = useCallback((event) => async (payload) => {
    try {
      await emitAsync(event, payload);
    } catch (err) {
      setError(err.message);
      window.alert(err.message);
    }
  }, []);

  // Racing the timer expiring is the only realistic failure here, and the broadcast state
  // is the source of truth either way — so no alert, unlike the other game actions.
  const onExtendForfeit = useCallback(async () => {
    try {
      await emitAsync('game:extendForfeit', {});
    } catch {
      /* ignore */
    }
  }, []);

  const onDeclare = useCallback((type, targetId) => gameAction('game:action')({ type, targetId }), [gameAction]);
  const onPass = useCallback(() => gameAction('game:pass')({}), [gameAction]);
  const onChallenge = useCallback(() => gameAction('game:challenge')({}), [gameAction]);
  const onBlock = useCallback((character) => gameAction('game:block')({ character }), [gameAction]);
  const onChooseLoss = useCallback((cardId) => gameAction('game:chooseLoss')({ cardId }), [gameAction]);
  const onExchangeSelect = useCallback((keepCardIds) => gameAction('game:exchangeSelect')({ keepCardIds }), [gameAction]);

  let content;
  if (screen === 'home' || !playerId) {
    content = <Home onCreate={handleCreate} onJoin={handleJoin} error={error} />;
  } else if (screen === 'lobby' && lobby) {
    content = <Lobby lobby={lobby} playerId={playerId} onStart={handleStart} error={error} />;
  } else if (screen === 'game' && gameState) {
    content = (
      <GameBoard
        gameState={gameState}
        playerId={playerId}
        onDeclare={onDeclare}
        onPass={onPass}
        onChallenge={onChallenge}
        onBlock={onBlock}
        onChooseLoss={onChooseLoss}
        onExchangeSelect={onExchangeSelect}
        onExtendForfeit={onExtendForfeit}
        onBackToHome={handleBackToHome}
      />
    );
  } else {
    content = <div className="screen">Connecting…</div>;
  }

  return (
    <>
      {content}
      <RulesModal />
    </>
  );
}
