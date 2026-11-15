const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function broadcastRoomList() {
  const publicRooms = [];
  const ongoingRooms = [];

  rooms.forEach((room) => {
    const roomSummary = {
      roomId: room.roomId,
      roomName: room.roomName,
      maxPlayers: room.maxPlayers,
      playerCount: room.players.length,
      spectatorCount: room.spectators.length,
      status: room.status,
      isPublic: room.isPublic
    };

    if (room.isPublic && room.status === 'waiting') {
      publicRooms.push(roomSummary);
    }
    if (room.status === 'playing') {
      ongoingRooms.push(roomSummary);
    }
  });

  io.emit('roomListUpdate', { publicRooms, ongoingRooms });
}

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);
  broadcastRoomList();

  // 1. 방 생성
  socket.on('createRoom', ({ roomName, maxPlayers, totalCards, isPublic, playerName }) => {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const room = {
      roomId: inviteCode,
      roomName: roomName || "SwitchBack Room",
      maxPlayers: parseInt(maxPlayers) || 5,
      totalCards: parseInt(totalCards) || 104,
      isPublic: Boolean(isPublic),
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || "Host", hand: [] }],
      spectators: [],
      playerMessages: [],
      spectatorMessages: [],
      status: 'waiting',
      deck: [],
      centerPile: null,
      direction: 'ascending',
      turnIndex: 0
    };

    rooms.set(inviteCode, room);
    socket.join(inviteCode);

    socket.emit('roomCreated', room);
    broadcastRoomList();
  });

  // 2. 방 참가 (플레이어)
  socket.on('joinRoom', ({ inviteCode, playerName }) => {
    const room = rooms.get(inviteCode);
    if (!room) return socket.emit('error', 'Room not found.');
    if (room.status !== 'waiting') return socket.emit('error', 'Game has already started. Join as a spectator.');
    if (room.players.length >= room.maxPlayers) return socket.emit('error', 'Room is full.');

    const newPlayer = { id: socket.id, name: playerName || "Player", hand: [] };
    room.players.push(newPlayer);
    socket.join(inviteCode);

    io.to(inviteCode).emit('roomUpdated', room);
    socket.emit('joinedRoom', room);
    broadcastRoomList();
  });

  // 3. 관전 참가
  socket.on('spectateRoom', ({ inviteCode, playerName }) => {
    const room = rooms.get(inviteCode);
    if (!room) return socket.emit('error', 'Room not found.');

    const newSpectator = { id: socket.id, name: playerName || "Spectator" };
    room.spectators.push(newSpectator);
    socket.join(inviteCode);

    socket.emit('spectatingRoom', room);
    io.to(inviteCode).emit('roomUpdated', room);
    broadcastRoomList();
  });

  // 4. 플레이어 내쫓기 (Kick) - 호스트 전용
  socket.on('kickPlayer', ({ roomId, targetSocketId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit('error', 'Only the host can kick players.');

    room.players = room.players.filter(p => p.id !== targetSocketId);
    io.to(targetSocketId).emit('kicked');
    io.to(roomId).emit('roomUpdated', room);
    broadcastRoomList();
  });

  // 5. 게임 시작

  // 4. 게임 시작
  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', 'Room not found.');
    if (room.hostId !== socket.id) return socket.emit('error', 'Only the host can start the game.');

    const T = room.totalCards;
    const initialHandSize = 8; // 💡 시작 시 손에 들고 있을 카드 수 (조절 가능)

    // 전체 카드 덱 생성 (1부터 T까지)
    let deck = Array.from({ length: T }, (_, i) => i + 1);
    deck = shuffleDeck(deck);

    // 각 플레이어에게 지정된 초기 카드 수만큼 나눠주기
    room.players.forEach(player => {
      player.hand = deck.splice(0, initialHandSize).sort((a, b) => a - b);
    });

    // 덱에서 카드를 하나 뽑아 중앙 카드(Center Pile)로 설정
    const startingCard = deck.pop();

    room.deck = deck;
    room.centerPile = startingCard;
    
    // 💡 방향을 완전히 랜덤하게 설정 (오름차순 혹은 내림차순)
    room.direction = Math.random() < 0.5 ? 'ascending' : 'descending';
    room.status = 'playing';
    room.turnIndex = 0;

    // 게임 시작 상태 브로드캐스트
    io.to(roomId).emit('gameStarted', {
      centerPile: room.centerPile,
      direction: room.direction,
      turnIndex: room.turnIndex,
      players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
    });

    room.players.forEach(player => {
      io.to(player.id).emit('updateHand', player.hand);
    });

    broadcastRoomList();
    console.log(`Game started in room ${roomId} | Center: ${startingCard} | Direction: ${room.direction}`);
  });

  // 💡 카드 한 장 더 가져오기 (Draw Card) 기능 추가
  socket.on('drawCard', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit('error', 'Not your turn!');
    }

    if (room.deck.length === 0) {
      return socket.emit('error', 'The deck is empty!');
    }

    // 덱에서 카드 한 장 뽑아서 플레이어 핸드에 추가
    const drawnCard = room.deck.pop();
    currentPlayer.hand.push(drawnCard);
    currentPlayer.hand.sort((a, b) => a - b);

    // 카드 뽑기를 수행하면 턴이 다음 사람으로 넘어감 (원하는 경우 턴 유지로 변경 가능)
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    io.to(roomId).emit('gameStateUpdate', {
      centerPile: room.centerPile,
      direction: room.direction,
      turnIndex: room.turnIndex,
      players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
    });

    io.to(currentPlayer.id).emit('updateHand', currentPlayer.hand);

    io.to(roomId).emit('receivePlayerMessage', {
      sender: 'System',
      text: `${currentPlayer.name} drew an extra card from the deck.`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 카드 내기 및 규칙 검증
  socket.on('playCard', ({ roomId, cardNum }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit('error', 'Not your turn!');
    }

    const cardIndex = currentPlayer.hand.indexOf(cardNum);
    if (cardIndex === -1) {
      return socket.emit('error', 'You do not have this card.');
    }

    const currentCenter = room.centerPile;
    const direction = room.direction;

    // 💡 스위치백 핵심 규칙 검증
    let isValid = false;
    if (direction === 'ascending') {
      // 오름차순: 더 커야 함 (단, 10 작은 수는 예외적으로 허용하는 룰 반영 가능)
      if (cardNum > currentCenter || cardNum === currentCenter - 10) {
        isValid = true;
      }
    } else {
      // 내림차순: 더 작아야 함 (단, 10 큰 수는 예외적으로 허용)
      if (cardNum < currentCenter || cardNum === currentCenter + 10) {
        isValid = true;
      }
    }

    if (!isValid) {
      return socket.emit('error', `Invalid move! Direction is ${direction}, Center is ${currentCenter}.`);
    }

    // 카드 정상 제출
    currentPlayer.hand.splice(cardIndex, 1);
    room.centerPile = cardNum;
    
    // 방향 전환 체크 (10 차이 나는 카드를 냈을 때 방향이 뒤집히는 규칙 등 필요시 추가)
    
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    io.to(roomId).emit('gameStateUpdate', {
      centerPile: room.centerPile,
      direction: room.direction,
      turnIndex: room.turnIndex,
      players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
    });

    io.to(currentPlayer.id).emit('updateHand', currentPlayer.hand);

    if (currentPlayer.hand.length === 0) {
      room.status = 'ended';
      io.to(roomId).emit('gameOver', { winner: currentPlayer.name });
    }
  });

  // 💡 체인지(턴 패스) 기능 추가
  socket.on('passTurn', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const currentPlayer = room.players[room.turnIndex];
    if (currentPlayer.id !== socket.id) {
      return socket.emit('error', 'Not your turn!');
    }

    // 턴 넘기기
    room.turnIndex = (room.turnIndex + 1) % room.players.length;

    io.to(roomId).emit('gameStateUpdate', {
      centerPile: room.centerPile,
      direction: room.direction,
      turnIndex: room.turnIndex,
      players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
    });

    io.to(roomId).emit('receivePlayerMessage', {
      sender: 'System',
      text: `${currentPlayer.name} passed their turn (Change).`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 7. 채팅
  socket.on('sendPlayerMessage', ({ roomId, message, senderName }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const chatMsg = { sender: senderName, text: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    room.playerMessages.push(chatMsg);
    io.to(roomId).emit('receivePlayerMessage', chatMsg);
  });

  socket.on('sendSpectatorMessage', ({ roomId, message, senderName }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const chatMsg = { sender: senderName, text: message, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
    room.spectatorMessages.push(chatMsg);
    io.to(roomId).emit('receiveSpectatorMessage', chatMsg);
  });

  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
    rooms.forEach((room, inviteCode) => {
      room.players = room.players.filter(p => p.id !== socket.id);
      room.spectators = room.spectators.filter(s => s.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(inviteCode);
      } else {
        if (room.hostId === socket.id) room.hostId = room.players[0].id;
        io.to(inviteCode).emit('roomUpdated', room);
      }
    });
    broadcastRoomList();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SwitchBack Server running on port ${PORT}`);
});