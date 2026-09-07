import { useState } from 'react';
import PlayerCard from './PlayerCard';
import ActionPanel from './ActionPanel';
import ResponsePanel from './ResponsePanel';
import LossModal from './LossModal';
import ExchangeModal from './ExchangeModal';
import LogFeed from './LogFeed';

const FORCED_COUP_COINS = 10;

export default function GameBoard({ gameState, playerId, onDeclare, onPass, onChallenge, onBlock, onChooseLoss, onExchangeSelect, onBackToHome }) {
  const [previewClaim, setPreviewClaim] = useState(null);
  const playersById = Object.fromEntries(gameState.players.map((p) => [p.id, p]));
  const myPlayer = playersById[playerId];
  const others = gameState.players.filter((p) => p.id !== playerId);
  const targetableOpponents = others.filter((p) => !p.eliminated);
  const isMyTurn = gameState.currentPlayerId === playerId;
  const pa = gameState.pendingAction;

  return (
    <div className="screen game-screen">
      {gameState.phase === 'ended' && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{playersById[gameState.winnerId]?.name || 'A player'} wins!</h2>
            <button className="primary" onClick={onBackToHome}>
              Back to Home
            </button>
          </div>
        </div>
      )}

      <div className="board-layout">
        <div className="action-rail">
          {gameState.pendingLoss ? (
            <LossModal
              pendingLoss={gameState.pendingLoss}
              myPlayer={myPlayer}
              playersById={playersById}
              playerId={playerId}
              onChooseLoss={onChooseLoss}
            />
          ) : pa && pa.phase === 'exchange-selection' ? (
            pa.actorId === playerId ? (
              <ExchangeModal exchangePool={pa.exchangePool} keepCount={pa.exchangeKeepCount} onSubmit={onExchangeSelect} />
            ) : (
              <ResponsePanel pendingAction={pa} playersById={playersById} playerId={playerId} onPass={onPass} onChallenge={onChallenge} onBlock={onBlock} />
            )
          ) : pa ? (
            <ResponsePanel pendingAction={pa} playersById={playersById} playerId={playerId} onPass={onPass} onChallenge={onChallenge} onBlock={onBlock} />
          ) : isMyTurn ? (
            <ActionPanel
              myPlayer={myPlayer}
              opponents={targetableOpponents}
              onDeclare={onDeclare}
              forcedCoup={myPlayer.coins >= FORCED_COUP_COINS}
              onPreviewAction={setPreviewClaim}
            />
          ) : (
            <p className="waiting-text">Waiting for {playersById[gameState.currentPlayerId]?.name} to take a turn…</p>
          )}
        </div>

        <div className="board-center">
          <div className="opponents-row">
            {others.map((p) => (
              <PlayerCard key={p.id} player={p} isTurn={gameState.currentPlayerId === p.id} isSelf={false} pendingAction={pa} />
            ))}
          </div>

          <div className="self-row">
            <PlayerCard player={myPlayer} isTurn={isMyTurn} isSelf pendingAction={pa} previewClaim={previewClaim} />
          </div>
        </div>

        <LogFeed log={gameState.log} />
      </div>
    </div>
  );
}
