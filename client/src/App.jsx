import React, { useState, useEffect } from 'react';
import { socket } from './socket';
import './style.css';

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomInfo, setRoomInfo] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Lobby lists
  const [publicRooms, setPublicRooms] = useState([]);
  const [ongoingRooms, setOngoingRooms] = useState([]);

  // User input states
  const [playerName, setPlayerName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [totalCards, setTotalCards] = useState(104);
  const [isPublic, setIsPublic] = useState(true);
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [viewMode, setViewMode] = useState('lobby');

  // Role Selection Modal State (방 입장 시 선택 팝업)
  const [pendingRoomCode, setPendingRoomCode] = useState(null);

  // Game & Chat states
  const [isSpectator, setIsSpectator] = useState(false);
  const [gameState, setGameState] = useState('waiting');
  const [myHand, setMyHand] = useState([]);
  const [centerPile, setCenterPile] = useState(null);
  const [direction, setDirection] = useState('ascending');
  const [turnIndex, setTurnIndex] = useState(0);
  const [gamePlayers, setGamePlayers] = useState([]);

  // Dual Chat states
  const [playerMessages, setPlayerMessages] = useState([]);
  const [spectatorMessages, setSpectatorMessages] = useState([]);
  const [playerInput, setPlayerInput] = useState('');
  const [spectatorInput, setSpectatorInput] = useState('');

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('roomListUpdate', ({ publicRooms, ongoingRooms }) => {
      setPublicRooms(publicRooms);
      setOngoingRooms(ongoingRooms);
    });

    socket.on('roomCreated', (room) => {
      setRoomInfo(room);
      setIsSpectator(false);
      setGameState('waiting');
      setErrorMessage('');
    });

    socket.on('joinedRoom', (room) => {
      setRoomInfo(room);
      setIsSpectator(false);
      setGameState('waiting');
      setErrorMessage('');
      setPendingRoomCode(null);
    });

    socket.on('spectatingRoom', (room) => {
      setRoomInfo(room);
      setIsSpectator(true);
      setGameState(room.status);
      setErrorMessage('');
      setPendingRoomCode(null);
    });

    socket.on('roomUpdated', (room) => {
      setRoomInfo(room);
    });

    socket.on('kicked', () => {
      alert('You have been kicked by the host.');
      setRoomInfo(null);
      setPendingRoomCode(null);
    });

    socket.on('gameStarted', ({ centerPile, direction, turnIndex, players }) => {
      setGameState('playing');
      setCenterPile(centerPile);
      setDirection(direction);
      setTurnIndex(turnIndex);
      setGamePlayers(players);
    });

    socket.on('gameStateUpdate', ({ centerPile, direction, turnIndex, players }) => {
      setCenterPile(centerPile);
      setDirection(direction);
      setTurnIndex(turnIndex);
      setGamePlayers(players);
    });

    socket.on('updateHand', (hand) => {
      setMyHand(hand);
    });

    socket.on('receivePlayerMessage', (msg) => {
      setPlayerMessages((prev) => [...prev, msg]);
    });

    socket.on('receiveSpectatorMessage', (msg) => {
      setSpectatorMessages((prev) => [...prev, msg]);
    });

    socket.on('gameOver', ({ winner }) => {
      alert(`🎉 Game Over! Winner: ${winner}`);
      setGameState('waiting');
    });

    socket.on('error', (msg) => {
      setErrorMessage(msg);
      alert(`Error: ${msg}`);
    });

    return () => {
      socket.off();
    };
  }, []);

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!playerName || !roomName) {
      alert('Please enter your nickname and room name!');
      return;
    }
    socket.emit('createRoom', {
      roomName,
      maxPlayers: parseInt(maxPlayers),
      totalCards: parseInt(totalCards),
      isPublic,
      playerName
    });
  };

  const tryJoinRoom = (code) => {
    if (!playerName) {
      alert('Please enter your nickname first!');
      return;
    }
    setPendingRoomCode(code);
  };

  const confirmJoin = (role) => {
    if (role === 'player') {
      socket.emit('joinRoom', { inviteCode: pendingRoomCode, playerName });
    } else {
      socket.emit('spectateRoom', { inviteCode: pendingRoomCode, playerName });
    }
  };

  const handleKick = (targetSocketId) => {
    socket.emit('kickPlayer', { roomId: roomInfo.roomId, targetSocketId });
  };

  const handleStartGame = () => {
    if (!roomInfo) return;
    socket.emit('startGame', { roomId: roomInfo.roomId });
  };

  const handlePlayCard = (cardNum) => {
    if (isSpectator) return;
    socket.emit('playCard', { roomId: roomInfo.roomId, cardNum });
  };

  const sendPlayerChat = (e) => {
    e.preventDefault();
    if (!playerInput.trim()) return;
    socket.emit('sendPlayerMessage', { roomId: roomInfo.roomId, message: playerInput, senderName: playerName });
    setPlayerInput('');
  };

  const sendSpectatorChat = (e) => {
    e.preventDefault();
    if (!spectatorInput.trim()) return;
    socket.emit('sendSpectatorMessage', { roomId: roomInfo.roomId, message: spectatorInput, senderName: playerName });
    setSpectatorInput('');
  };

  return (
    <div className="app-container">
      {/* Main Content Area */}
      <div className="main-content">
        <h1>SwitchBack Card Game</h1>
        
        <div className="status-box">
          Server Status: 
          <span style={{ color: isConnected ? '#28a745' : '#dc3545', fontWeight: 'bold', marginLeft: '5px' }}>
            {isConnected ? 'Connected (Online)' : 'Disconnected (Offline)'}
          </span>
        </div>

        {errorMessage && (
          <div style={{ padding: '10px', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '6px', marginBottom: '15px', fontSize: '14px' }}>
            {errorMessage}
          </div>
        )}

        {/* Role Selection Modal / Popup before entering room */}
        {pendingRoomCode && (
          <div style={{ background: '#e9ecef', padding: '20px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center', border: '2px solid #007bff' }}>
            <h3>Choose your role for Room [{pendingRoomCode}]</h3>
            <p>How would you like to enter this room?</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '15px' }}>
              <button onClick={() => confirmJoin('player')} style={{ backgroundColor: '#28a745' }}>Join as Player</button>
              <button onClick={() => confirmJoin('spectator')} className="secondary">Watch as Spectator</button>
              <button onClick={() => setPendingRoomCode(null)} className="danger" style={{ width: 'auto' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* 1. Lobby View */}
        {!roomInfo && !pendingRoomCode ? (
          <div>
            <div className="form-group">
              <label>Your Nickname:</label>
              <input 
                type="text" 
                value={playerName} 
                onChange={(e) => setPlayerName(e.target.value)} 
                placeholder="Enter your nickname"
              />
            </div>

            {viewMode === 'lobby' && (
              <div className="button-group" style={{ marginTop: '15px' }}>
                <button onClick={() => { if(!playerName) alert('Enter nickname first!'); else setViewMode('create'); }}>
                  Create Room
                </button>
                
                <div className="form-group" style={{ marginTop: '15px' }}>
                  <label>Direct Join with Code:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      value={inviteCodeInput} 
                      onChange={(e) => setInviteCodeInput(e.target.value)} 
                      placeholder="Enter Invite Code"
                    />
                    <button onClick={() => tryJoinRoom(inviteCodeInput.trim().toUpperCase())} style={{ width: '100px', marginTop: '0' }}>Join</button>
                  </div>
                </div>

                <h3 style={{ marginTop: '20px' }}>Public Waiting Rooms</h3>
                {publicRooms.length === 0 ? (
                  <p style={{ color: '#777', fontSize: '14px' }}>No public rooms available.</p>
                ) : (
                  <ul className="player-list">
                    {publicRooms.map((r) => (
                      <li key={r.roomId}>
                        <span><strong>{r.roomName}</strong> ({r.playerCount}/{r.maxPlayers})</span>
                        <button onClick={() => tryJoinRoom(r.roomId)} style={{ width: 'auto', padding: '6px 12px', margin: '0', fontSize: '13px' }}>Join</button>
                      </li>
                    ))}
                  </ul>
                )}

                <h3 style={{ marginTop: '20px' }}>Ongoing Matches (Spectate)</h3>
                {ongoingRooms.length === 0 ? (
                  <p style={{ color: '#777', fontSize: '14px' }}>No ongoing matches to watch.</p>
                ) : (
                  <ul className="player-list">
                    {ongoingRooms.map((r) => (
                      <li key={r.roomId}>
                        <span>📺 <strong>{r.roomName}</strong> (Players: {r.playerCount})</span>
                        <button className="secondary" onClick={() => tryJoinRoom(r.roomId)} style={{ width: 'auto', padding: '6px 12px', margin: '0', fontSize: '13px' }}>Watch</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {viewMode === 'create' && (
              <form onSubmit={handleCreateRoom} style={{ marginTop: '15px' }}>
                <div className="form-group">
                  <label>Room Name:</label>
                  <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Room Name" />
                </div>
                <div className="form-group">
                  <label>Max Players (2-5):</label>
                  <input type="number" min="2" max="5" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Total Cards:</label>
                  <input type="number" value={totalCards} onChange={(e) => setTotalCards(e.target.value)} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} id="isPublicCheck" style={{ width: 'auto' }} />
                  <label htmlFor="isPublicCheck" style={{ margin: '0', cursor: 'pointer' }}>Public Room (Show in Lobby)</label>
                </div>
                {/* 💡 Create Room 버튼과 Back 버튼이 겹치지 않도록 button-group으로 깔끔하게 분리 */}
                <div className="button-group">
                  <button type="submit">Create Room</button>
                  <button type="button" className="secondary" onClick={() => setViewMode('lobby')}>Back to Lobby</button>
                </div>
              </form>
            )}
          </div>
        ) : roomInfo ? (
          /* 2. Room / Game View */
          <div className="room-card">
            <h2>{isSpectator ? '📺 Spectator Mode' : '🎮 Game Room'}</h2>
            <p>Room Name: <strong>{roomInfo.roomName}</strong></p>
            <p>Invite Code: <strong style={{ color: '#007bff', fontSize: '18px' }}>{roomInfo.roomId}</strong></p>
            
            <p style={{ marginTop: '10px', fontWeight: '600' }}>Players ({roomInfo.players.length} / {roomInfo.maxPlayers}):</p>
            <ul className="player-list">
              {roomInfo.players.map((p, index) => {
                const isCurrentTurn = gamePlayers[turnIndex]?.id === p.id && gameState === 'playing';
                const isHost = roomInfo.hostId === socket.id;
                const isMe = p.id === socket.id;

                return (
                  <li key={p.id} style={{ backgroundColor: isCurrentTurn ? '#d4edda' : '#eef2f7' }}>
                    <span>
                      {index === 0 ? '👑 ' : '👤 '} {p.name} {isMe ? '(You)' : ''} {isCurrentTurn ? '⭐ (Turn)' : ''}
                    </span>
                    {isHost && !isMe && gameState === 'waiting' && (
                      <button className="danger" onClick={() => handleKick(p.id)}>Kick</button>
                    )}
                  </li>
                );
              })}
            </ul>

            {roomInfo.spectators.length > 0 && (
              <>
                <p style={{ marginTop: '10px', fontWeight: '600' }}>Spectators ({roomInfo.spectators.length}):</p>
                <ul className="player-list" style={{ background: '#f1f3f5' }}>
                  {roomInfo.spectators.map((s) => (
                    <li key={s.id}><span>👀 {s.name} {s.id === socket.id ? '(You)' : ''}</span></li>
                  ))}
                </ul>
              </>
            )}

            {gameState === 'waiting' && !isSpectator && (
              roomInfo.hostId === socket.id ? (
                <button onClick={handleStartGame} style={{ backgroundColor: '#28a745', marginTop: '15px' }}>
                  Start Game
                </button>
              ) : (
                <p style={{ textAlign: 'center', color: '#666', fontStyle: 'italic', marginTop: '15px' }}>
                  Waiting for the host to start the game...
                </p>
              )
            )}

            {gameState === 'playing' && (
                <div style={{ marginTop: '20px', padding: '20px', background: '#eef2f7', borderRadius: '10px', textAlign: 'center', border: '1px solid #d1d8e0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '15px', background: '#fff', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                    <div>
                        <span style={{ fontSize: '13px', color: '#666', display: 'block' }}>CENTER PILE</span>
                        <strong style={{ fontSize: '36px', color: '#007bff' }}>{centerPile}</strong>
                    </div>
                    <div>
                        <span style={{ fontSize: '13px', color: '#666', display: 'block' }}>DIRECTION</span>
                        <strong style={{ fontSize: '18px', color: direction === 'ascending' ? '#28a745' : '#dc3545' }}>
                        {direction === 'ascending' ? '📈 Ascending (오름차순)' : '📉 Descending (내림차순)'}
                        </strong>
                    </div>
                    <div>
                        <span style={{ fontSize: '13px', color: '#666', display: 'block' }}>CURRENT TURN</span>
                        <strong style={{ fontSize: '18px', color: '#fd7e14' }}>{gamePlayers[turnIndex]?.name}</strong>
                    </div>
                    </div>

                    {/* 💡 체인지(턴 패스) 버튼 추가 */}
                    {!isSpectator && gamePlayers[turnIndex]?.id === socket.id && (
                    <div style={{ marginBottom: '15px' }}>
                        <button 
                        onClick={() => socket.emit('passTurn', { roomId: roomInfo.roomId })}
                        style={{ backgroundColor: '#ffc107', color: '#000', fontWeight: 'bold', width: 'auto', padding: '10px 20px' }}
                        >
                        🔄 Change Turn (Pass)
                        </button>
                    </div>
                    )}

                    {!isSpectator && (
                    <>
                        <h3 style={{ marginTop: '10px', marginBottom: '10px' }}>Your Hand (Click card to play)</h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                        {myHand.map((card) => (
                            <div key={card} className="card-item" onClick={() => handlePlayCard(card)}>
                            {card}
                            </div>
                        ))}
                        </div>
                    </>
                    )}
                </div>
                )}
          </div>
        ) : null}
      </div>

      {/* Sidebar with Dual Chat Rooms */}
      {roomInfo && (
        <div className="sidebar-container">
          {/* Player Chat Box */}
          <div className="chat-box">
            <h3>💬 Player Chat</h3>
            <div className="chat-messages">
              {playerMessages.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '12px', textAlign: 'center', margin: 'auto' }}>No messages.</p>
              ) : (
                playerMessages.map((m, idx) => (
                  <div key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>
                    <strong>{m.sender}:</strong> {m.text}
                  </div>
                ))
              )}
            </div>
            <form onSubmit={sendPlayerChat} style={{ display: 'flex', gap: '5px', margin: '0' }}>
              <input 
                type="text" 
                value={playerInput} 
                onChange={(e) => setPlayerInput(e.target.value)} 
                placeholder={isSpectator ? "Players only chat" : "Chat as player..."}
                disabled={isSpectator}
                style={{ flex: '1', margin: '0' }}
              />
              <button type="submit" disabled={isSpectator} style={{ width: '60px', margin: '0', padding: '8px' }}>Send</button>
            </form>
          </div>

          {/* Spectator Chat Box */}
          <div className="chat-box">
            <h3>👀 Spectator Chat</h3>
            <div className="chat-messages">
              {spectatorMessages.length === 0 ? (
                <p style={{ color: '#aaa', fontSize: '12px', textAlign: 'center', margin: 'auto' }}>No messages.</p>
              ) : (
                spectatorMessages.map((m, idx) => (
                  <div key={idx} style={{ fontSize: '13px', marginBottom: '4px' }}>
                    <strong>{m.sender}:</strong> {m.text}
                  </div>
                ))
              )}
            </div>
            <form onSubmit={sendSpectatorChat} style={{ display: 'flex', gap: '5px', margin: '0' }}>
              <input 
                type="text" 
                value={spectatorInput} 
                onChange={(e) => setSpectatorInput(e.target.value)} 
                placeholder={!isSpectator ? "Spectators only chat" : "Chat as spectator..."}
                disabled={!isSpectator}
                style={{ flex: '1', margin: '0' }}
              />
              <button type="submit" disabled={!isSpectator} style={{ width: '60px', margin: '0', padding: '8px' }}>Send</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;