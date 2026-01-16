const WS_URL = `ws://${location.hostname}:8080`;

const titleEl = document.getElementById('title');
const taglineEl = document.getElementById('tagline');
const lobbyEl = document.getElementById('lobby');
const gameEl = document.getElementById('game');
const usernameLabel = document.getElementById('username-label');
const roomnameLabel = document.getElementById('roomname-label');
const usernameInput = document.getElementById('username');
const roomnameInput = document.getElementById('roomname');
const createRoomBtn = document.getElementById('create-room');
const refreshRoomsBtn = document.getElementById('refresh-rooms');
const roomListTitle = document.getElementById('room-list-title');
const roomList = document.getElementById('room-list');
const roomStatus = document.getElementById('room-status');
const turnStatus = document.getElementById('turn-status');
const leaveRoomBtn = document.getElementById('leave-room');
const legendTitle = document.getElementById('legend-title');
const legendList = document.getElementById('legend-list');
const boardCanvas = document.getElementById('board');
const ctx = boardCanvas.getContext('2d');

let socket;
let currentRoom = null;
let playerColor = null;
let username = null;
let gameState = null;
let selected = null;

const pieceNames = {
  k: 'Spaghettikini',
  q: 'Marinarakini',
  r: 'MeatballTowerini',
  b: 'Cannellonihini',
  n: 'ForkRiderini',
  p: 'Noodlini',
};

function enforceIni(text) {
  return text
    .split(' ')
    .map((word) => {
      if (!word) return '';
      const match = word.match(/^(.+?)([!?.:,;]*)$/);
      const base = match ? match[1] : word;
      const punctuation = match ? match[2] : '';
      if (base.toLowerCase().endsWith('ini')) {
        return `${base}${punctuation}`;
      }
      return `${base}ini${punctuation}`;
    })
    .join(' ');
}

function setIniText(el, text) {
  el.textContent = enforceIni(text);
}

function applyIniToInput(input) {
  input.value = enforceIni(input.value.trim()).replace(/\s+/g, ' ');
}

function initStaticText() {
  setIniText(titleEl, 'chessini');
  setIniText(taglineEl, 'Spaghetti duel lobby');
  setIniText(usernameLabel, 'Username');
  setIniText(roomnameLabel, 'Room name');
  usernameInput.placeholder = enforceIni('Username');
  roomnameInput.placeholder = enforceIni('Room name');
  setIniText(createRoomBtn, 'Create room');
  setIniText(refreshRoomsBtn, 'Refresh rooms');
  setIniText(roomListTitle, 'Open rooms');
  setIniText(leaveRoomBtn, 'Leave room');
  setIniText(legendTitle, 'Piece legend');

  legendList.innerHTML = '';
  Object.entries(pieceNames).forEach(([key, name]) => {
    const item = document.createElement('li');
    item.textContent = enforceIni(`${name}`);
    legendList.appendChild(item);
  });
}

function connectSocket() {
  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    requestRooms();
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'room_list') {
      renderRoomList(message.rooms);
    }
    if (message.type === 'room_joined') {
      currentRoom = message.room;
      playerColor = message.color;
      username = message.username;
      showGame();
      if (message.state === 'waiting') {
        setIniText(roomStatus, 'Wait for opponent');
        setIniText(turnStatus, 'Room locked after join');
      }
    }
    if (message.type === 'state') {
      gameState = message;
      drawBoard();
      updateTurnStatus();
    }
    if (message.type === 'player_left') {
      gameState = null;
      setIniText(roomStatus, 'Wait for opponent');
      setIniText(turnStatus, 'Opponent left');
      drawBoard();
    }
    if (message.type === 'error') {
      setIniText(turnStatus, `Error ${message.reason}`);
    }
  });
}

function requestRooms() {
  sendMessage({ type: 'list_rooms' });
}

function sendMessage(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function showGame() {
  lobbyEl.classList.add('hidden');
  gameEl.classList.remove('hidden');
  setIniText(roomStatus, `Room ${currentRoom}`);
}

function showLobby() {
  lobbyEl.classList.remove('hidden');
  gameEl.classList.add('hidden');
  currentRoom = null;
  playerColor = null;
  gameState = null;
  selected = null;
  drawBoard();
}

function renderRoomList(rooms) {
  roomList.innerHTML = '';
  if (!rooms.length) {
    const item = document.createElement('li');
    item.textContent = enforceIni('No open rooms');
    roomList.appendChild(item);
    return;
  }
  rooms.forEach((room) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = enforceIni(`${room.name} (${room.count}/2)`);
    const joinBtn = document.createElement('button');
    joinBtn.classList.add('secondary');
    setIniText(joinBtn, 'Join');
    joinBtn.addEventListener('click', () => {
      applyIniToInput(usernameInput);
      applyIniToInput(roomnameInput);
      const name = usernameInput.value || enforceIni('Player');
      sendMessage({ type: 'join_room', name: room.name, username: name });
    });
    item.appendChild(label);
    item.appendChild(joinBtn);
    roomList.appendChild(item);
  });
}

function updateTurnStatus() {
  if (!gameState) return;
  const turnLabel = gameState.turn === 'w' ? 'White to move' : 'Black to move';
  setIniText(turnStatus, turnLabel);
  if (gameState.turn !== playerColor) {
    setIniText(roomStatus, 'Opponent turn');
  } else {
    setIniText(roomStatus, 'Your turn');
  }
}

function getSquareFromEvent(event) {
  const rect = boardCanvas.getBoundingClientRect();
  const size = boardCanvas.width / 8;
  const x = Math.floor((event.clientX - rect.left) / size);
  const y = Math.floor((event.clientY - rect.top) / size);
  return { r: y, c: x };
}

function handleBoardClick(event) {
  if (!gameState || !currentRoom) return;
  if (gameState.turn !== playerColor) return;
  const { r, c } = getSquareFromEvent(event);
  const piece = gameState.board?.[r]?.[c];
  if (!selected) {
    if (piece && piece.color === playerColor) {
      selected = { r, c };
      drawBoard();
    }
    return;
  }
  if (selected.r === r && selected.c === c) {
    selected = null;
    drawBoard();
    return;
  }
  sendMessage({ type: 'move', room: currentRoom, from: selected, to: { r, c } });
  selected = null;
}

function drawBoard() {
  ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  const size = boardCanvas.width / 8;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const light = (r + c) % 2 === 0;
      ctx.fillStyle = light ? '#f7e6d1' : '#c78f6a';
      ctx.fillRect(c * size, r * size, size, size);

      if (gameState?.lastMove) {
        const { from, to } = gameState.lastMove;
        if ((from.r === r && from.c === c) || (to.r === r && to.c === c)) {
          ctx.fillStyle = 'rgba(255, 235, 120, 0.4)';
          ctx.fillRect(c * size, r * size, size, size);
        }
      }

      if (selected && selected.r === r && selected.c === c) {
        ctx.fillStyle = 'rgba(120, 200, 255, 0.4)';
        ctx.fillRect(c * size, r * size, size, size);
      }

      const piece = gameState?.board?.[r]?.[c];
      if (piece) {
        drawPiece(piece, c * size, r * size, size);
      }
    }
  }
}

function drawPiece(piece, x, y, size) {
  const padding = size * 0.15;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const palette = piece.color === 'w' ? ['#fdf7ee', '#d9b38c'] : ['#5a2d1a', '#d08c58'];

  ctx.save();
  ctx.translate(centerX, centerY);

  ctx.fillStyle = palette[0];
  ctx.beginPath();
  ctx.ellipse(0, size * 0.12, size * 0.22, size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = palette[1];

  const drawNoodles = (count, height) => {
    for (let i = 0; i < count; i += 1) {
      ctx.beginPath();
      const offset = ((i - (count - 1) / 2) * size * 0.04);
      ctx.moveTo(offset, -height);
      ctx.lineTo(offset, height);
      ctx.stroke();
    }
  };

  const pieceType = piece.type;
  if (pieceType === 'p') {
    drawNoodles(4, size * 0.22);
  }
  if (pieceType === 'r') {
    ctx.fillStyle = palette[1];
    ctx.beginPath();
    ctx.arc(0, -size * 0.1, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, size * 0.08, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, size * 0.26, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pieceType === 'n') {
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-size * 0.15, size * 0.25);
    ctx.lineTo(0, -size * 0.15);
    ctx.lineTo(size * 0.15, size * 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -size * 0.18, size * 0.14, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (pieceType === 'b') {
    drawNoodles(3, size * 0.22);
    ctx.fillStyle = palette[1];
    ctx.beginPath();
    ctx.moveTo(-size * 0.1, -size * 0.22);
    ctx.lineTo(0, -size * 0.34);
    ctx.lineTo(size * 0.1, -size * 0.22);
    ctx.closePath();
    ctx.fill();
  }
  if (pieceType === 'q') {
    drawNoodles(5, size * 0.22);
    ctx.fillStyle = '#b93b3b';
    ctx.beginPath();
    ctx.arc(-size * 0.12, -size * 0.26, size * 0.05, 0, Math.PI * 2);
    ctx.arc(0, -size * 0.32, size * 0.05, 0, Math.PI * 2);
    ctx.arc(size * 0.12, -size * 0.26, size * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pieceType === 'k') {
    drawNoodles(5, size * 0.24);
    ctx.strokeStyle = '#b93b3b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.38);
    ctx.lineTo(0, -size * 0.26);
    ctx.moveTo(-size * 0.06, -size * 0.32);
    ctx.lineTo(size * 0.06, -size * 0.32);
    ctx.stroke();
  }

  ctx.restore();
}

function ensureDefaultInputs() {
  if (!usernameInput.value) {
    usernameInput.value = enforceIni('Player');
  }
  if (!roomnameInput.value) {
    roomnameInput.value = enforceIni('Room');
  }
}

createRoomBtn.addEventListener('click', () => {
  ensureDefaultInputs();
  applyIniToInput(usernameInput);
  applyIniToInput(roomnameInput);
  const name = roomnameInput.value || enforceIni('Room');
  const user = usernameInput.value || enforceIni('Player');
  sendMessage({ type: 'create_room', name, username: user });
});

refreshRoomsBtn.addEventListener('click', () => requestRooms());

leaveRoomBtn.addEventListener('click', () => {
  showLobby();
  requestRooms();
});

boardCanvas.addEventListener('click', handleBoardClick);

initStaticText();
ensureDefaultInputs();
connectSocket();
