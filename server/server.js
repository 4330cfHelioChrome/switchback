const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // 실제 배포 시 프론트엔드 도메인으로 제한하는 것이 좋습니다.
    methods: ["GET", "POST"]
  }
});

// 활성화된 방들을 관리하는 메모리 저장소
const rooms = new Map();

// 덱 셔플 유틸리티 함수 (Fisher-Yates Shuffle)
function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // 1. 방 생성 이벤트
  socket.on('createRoom', ({ roomName, maxPlayers, totalCards, isPublic, playerName }) => {
    // 6자리 랜덤 초대 코드 생성 (비공개 입장 및 고유 식별용)
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    const room = {
      roomId: inviteCode,
      roomName: roomName || "SwitchBack Room",
      maxPlayers: parseInt(maxPlayers) || 5,
      totalCards: parseInt(totalCards) || 104,
      isPublic: isPublic ?? true,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName || "Host", hand: [] }],
      spectators: [],
      status: 'waiting', // waiting, playing, ended
      deck: [],
      centerPile: null,
      direction: 'ascending', // 'ascending' 또는 'descending'
      turnIndex: 0
    };

    rooms.set(inviteCode, room);
    socket.join(inviteCode);

    // 방 생성자에게 성공 알림 및 방 정보 전송
    socket.emit('roomCreated', room);
    console.log(`Room created: ${inviteCode} by ${socket.id}`);
  });

  // 2. 게임 시작 및 카드 분배 로직
  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', '방을 찾을 수 없습니다.');
    if (room.hostId !== socket.id) return socket.emit('error', '방장만 게임을 시작할 수 있습니다.');

    const P = room.players.length;
    const T = room.totalCards;

    // 기획서 공식 적용: 손에 쥐는 카드 수 = floor(총 카드 수 / 플레이어 수)
    const handSize = Math.floor(T / P);

    // 1부터 T까지의 번호가 적힌 카드 덱 생성 후 셔플
    let deck = Array.from({ length: T }, (_, i) => i + 1);
    deck = shuffleDeck(deck);

    // 각 플레이어에게 카드 분배
    room.players.forEach(player => {
      player.hand = deck.splice(0, handSize);
    });

    // 남은 카드는 드로우 파일로 유지하고, 1장을 뒤집어 센터 파일(Center Pile)로 지정
    const startingCard = deck.pop();
    const midpoint = T / 2;

    // 시작 카드가 중간값 이하이면 Ascending, 초과이면 Descending
    const initialDirection = startingCard <= midpoint ? 'ascending' : 'descending';

    room.deck = deck;
    room.centerPile = startingCard;
    room.direction = initialDirection;
    room.status = 'playing';

    // 각 플레이어에게 개인 패와 게임 시작 상태 전송
    room.players.forEach(player => {
      io.to(player.id).emit('gameStarted', {
        myHand: player.hand,
        centerPile: room.centerPile,
        direction: room.direction,
        players: room.players.map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length }))
      });
    });

    console.log(`Game started in room ${roomId}. Hand size per player: ${handSize}`);
  });

  socket.on('disconnect', () => {
    console.log(`User Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SwitchBack Server running on port ${PORT}`);
});