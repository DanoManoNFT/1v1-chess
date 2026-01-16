const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = new Map();

function createInitialBoard() {
  const emptyRow = () => Array.from({ length: 8 }, () => null);
  const board = Array.from({ length: 8 }, emptyRow);

  const backRank = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let col = 0; col < 8; col += 1) {
    board[0][col] = { type: backRank[col], color: 'b', hasMoved: false };
    board[1][col] = { type: 'p', color: 'b', hasMoved: false };
    board[6][col] = { type: 'p', color: 'w', hasMoved: false };
    board[7][col] = { type: backRank[col], color: 'w', hasMoved: false };
  }
  return board;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));
}

function findKing(board, color) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && piece.type === 'k' && piece.color === color) {
        return { r, c };
      }
    }
  }
  return null;
}

function isInside(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function isSquareAttacked(board, targetR, targetC, byColor) {
  const opponent = byColor;
  const pawnDir = opponent === 'w' ? -1 : 1;

  const pawnAttacks = [
    { r: targetR + pawnDir, c: targetC - 1 },
    { r: targetR + pawnDir, c: targetC + 1 },
  ];
  for (const pos of pawnAttacks) {
    if (!isInside(pos.r, pos.c)) continue;
    const piece = board[pos.r][pos.c];
    if (piece && piece.color === opponent && piece.type === 'p') {
      return true;
    }
  }

  const knightMoves = [
    [2, 1],
    [2, -1],
    [-2, 1],
    [-2, -1],
    [1, 2],
    [1, -2],
    [-1, 2],
    [-1, -2],
  ];
  for (const [dr, dc] of knightMoves) {
    const r = targetR + dr;
    const c = targetC + dc;
    if (!isInside(r, c)) continue;
    const piece = board[r][c];
    if (piece && piece.color === opponent && piece.type === 'n') {
      return true;
    }
  }

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [dr, dc] of directions) {
    let r = targetR + dr;
    let c = targetC + dc;
    while (isInside(r, c)) {
      const piece = board[r][c];
      if (piece) {
        if (piece.color === opponent) {
          if (dr === 0 || dc === 0) {
            if (piece.type === 'r' || piece.type === 'q') return true;
          } else if (piece.type === 'b' || piece.type === 'q') {
            return true;
          }
          if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && piece.type === 'k') {
            return true;
          }
        }
        break;
      }
      r += dr;
      c += dc;
    }
  }
  return false;
}

function getPieceMoves(game, r, c) {
  const board = game.board;
  const piece = board[r][c];
  if (!piece) return [];
  const moves = [];
  const color = piece.color;
  const forward = color === 'w' ? -1 : 1;

  const addMove = (toR, toC, extras = {}) => {
    if (!isInside(toR, toC)) return;
    const target = board[toR][toC];
    if (!target || target.color !== color || extras.allowCapture) {
      moves.push({ from: { r, c }, to: { r: toR, c: toC }, ...extras });
    }
  };

  if (piece.type === 'p') {
    const oneR = r + forward;
    if (isInside(oneR, c) && !board[oneR][c]) {
      addMove(oneR, c);
      const startRow = color === 'w' ? 6 : 1;
      const twoR = r + forward * 2;
      if (r === startRow && !board[twoR][c]) {
        addMove(twoR, c, { doubleStep: true });
      }
    }
    for (const dc of [-1, 1]) {
      const capR = r + forward;
      const capC = c + dc;
      if (!isInside(capR, capC)) continue;
      const target = board[capR][capC];
      if (target && target.color !== color) {
        addMove(capR, capC, { capture: true, allowCapture: true });
      }
    }
    if (game.enPassant) {
      const { r: epR, c: epC } = game.enPassant;
      if (Math.abs(epC - c) === 1 && epR === r + forward) {
        addMove(epR, epC, { enPassant: true, allowCapture: true });
      }
    }
  }

  if (piece.type === 'n') {
    const jumps = [
      [2, 1],
      [2, -1],
      [-2, 1],
      [-2, -1],
      [1, 2],
      [1, -2],
      [-1, 2],
      [-1, -2],
    ];
    for (const [dr, dc] of jumps) {
      const nr = r + dr;
      const nc = c + dc;
      if (!isInside(nr, nc)) continue;
      const target = board[nr][nc];
      if (!target || target.color !== color) {
        addMove(nr, nc, { capture: Boolean(target), allowCapture: true });
      }
    }
  }

  if (piece.type === 'b' || piece.type === 'r' || piece.type === 'q') {
    const dirs = [];
    if (piece.type === 'b' || piece.type === 'q') {
      dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    }
    if (piece.type === 'r' || piece.type === 'q') {
      dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    }
    for (const [dr, dc] of dirs) {
      let nr = r + dr;
      let nc = c + dc;
      while (isInside(nr, nc)) {
        const target = board[nr][nc];
        if (!target) {
          addMove(nr, nc);
        } else {
          if (target.color !== color) {
            addMove(nr, nc, { capture: true, allowCapture: true });
          }
          break;
        }
        nr += dr;
        nc += dc;
      }
    }
  }

  if (piece.type === 'k') {
    for (const dr of [-1, 0, 1]) {
      for (const dc of [-1, 0, 1]) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (!isInside(nr, nc)) continue;
        const target = board[nr][nc];
        if (!target || target.color !== color) {
          addMove(nr, nc, { capture: Boolean(target), allowCapture: true });
        }
      }
    }

    if (!piece.hasMoved && !isSquareAttacked(board, r, c, color === 'w' ? 'b' : 'w')) {
      const homeRow = color === 'w' ? 7 : 0;
      const rookColKingside = 7;
      const rookColQueenside = 0;
      const rookKingside = board[homeRow][rookColKingside];
      if (
        rookKingside &&
        rookKingside.type === 'r' &&
        !rookKingside.hasMoved &&
        !board[homeRow][5] &&
        !board[homeRow][6]
      ) {
        if (
          !isSquareAttacked(board, homeRow, 5, color === 'w' ? 'b' : 'w') &&
          !isSquareAttacked(board, homeRow, 6, color === 'w' ? 'b' : 'w')
        ) {
          addMove(homeRow, 6, { castle: 'kingside' });
        }
      }
      const rookQueenside = board[homeRow][rookColQueenside];
      if (
        rookQueenside &&
        rookQueenside.type === 'r' &&
        !rookQueenside.hasMoved &&
        !board[homeRow][1] &&
        !board[homeRow][2] &&
        !board[homeRow][3]
      ) {
        if (
          !isSquareAttacked(board, homeRow, 2, color === 'w' ? 'b' : 'w') &&
          !isSquareAttacked(board, homeRow, 3, color === 'w' ? 'b' : 'w')
        ) {
          addMove(homeRow, 2, { castle: 'queenside' });
        }
      }
    }
  }

  return moves;
}

function applyMove(game, move) {
  const board = cloneBoard(game.board);
  const piece = board[move.from.r][move.from.c];
  board[move.from.r][move.from.c] = null;

  if (move.enPassant) {
    const dir = piece.color === 'w' ? 1 : -1;
    board[move.to.r + dir][move.to.c] = null;
  }

  if (move.castle === 'kingside') {
    const row = piece.color === 'w' ? 7 : 0;
    const rook = board[row][7];
    board[row][7] = null;
    board[row][5] = { ...rook, hasMoved: true };
  }
  if (move.castle === 'queenside') {
    const row = piece.color === 'w' ? 7 : 0;
    const rook = board[row][0];
    board[row][0] = null;
    board[row][3] = { ...rook, hasMoved: true };
  }

  let newPiece = { ...piece, hasMoved: true };
  const promotionRow = piece.color === 'w' ? 0 : 7;
  if (piece.type === 'p' && move.to.r === promotionRow) {
    newPiece = { ...newPiece, type: 'q' };
  }

  board[move.to.r][move.to.c] = newPiece;

  const nextEnPassant = move.doubleStep
    ? { r: (move.from.r + move.to.r) / 2, c: move.from.c }
    : null;

  return { board, enPassant: nextEnPassant };
}

function validateAndApplyMove(game, from, to, color) {
  if (game.turn !== color) return { ok: false, reason: 'not-your-turn' };
  const piece = game.board[from.r][from.c];
  if (!piece || piece.color !== color) return { ok: false, reason: 'no-piece' };

  const moves = getPieceMoves(game, from.r, from.c);
  const chosen = moves.find((m) => m.to.r === to.r && m.to.c === to.c);
  if (!chosen) return { ok: false, reason: 'illegal-move' };

  const simulated = applyMove(game, chosen);
  const kingPos = findKing(simulated.board, color);
  if (!kingPos) return { ok: false, reason: 'no-king' };
  const opponent = color === 'w' ? 'b' : 'w';
  if (isSquareAttacked(simulated.board, kingPos.r, kingPos.c, opponent)) {
    return { ok: false, reason: 'in-check' };
  }

  game.board = simulated.board;
  game.enPassant = simulated.enPassant;
  game.turn = opponent;
  game.lastMove = { from, to, piece: piece.type, color };
  return { ok: true };
}

function serializeBoard(board) {
  return board.map((row) =>
    row.map((piece) =>
      piece
        ? {
            type: piece.type,
            color: piece.color,
            hasMoved: piece.hasMoved,
          }
        : null
    )
  );
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(room, payload) {
  room.players.forEach((player) => send(player.ws, payload));
}

function listOpenRooms() {
  const result = [];
  rooms.forEach((room) => {
    if (!room.locked) {
      result.push({ name: room.name, count: room.players.length });
    }
  });
  return result;
}

function handleDisconnect(ws) {
  rooms.forEach((room, name) => {
    const index = room.players.findIndex((player) => player.ws === ws);
    if (index !== -1) {
      room.players.splice(index, 1);
      room.locked = false;
      room.game = null;
      broadcast(room, { type: 'player_left' });
      if (room.players.length === 0) {
        rooms.delete(name);
      }
    }
  });
}

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch (err) {
      return;
    }

    if (message.type === 'list_rooms') {
      send(ws, { type: 'room_list', rooms: listOpenRooms() });
    }

    if (message.type === 'create_room') {
      const name = String(message.name || '').trim() || 'roomini';
      if (rooms.has(name)) {
        send(ws, { type: 'error', reason: 'room-exists' });
        return;
      }
      const room = {
        name,
        players: [],
        locked: false,
        game: null,
      };
      rooms.set(name, room);
      const player = {
        ws,
        username: String(message.username || 'playerini'),
        color: 'w',
      };
      room.players.push(player);
      send(ws, {
        type: 'room_joined',
        room: room.name,
        color: player.color,
        username: player.username,
        state: 'waiting',
      });
    }

    if (message.type === 'join_room') {
      const name = String(message.name || '').trim();
      const room = rooms.get(name);
      if (!room || room.locked) {
        send(ws, { type: 'error', reason: 'room-unavailable' });
        return;
      }
      if (room.players.length >= 2) {
        send(ws, { type: 'error', reason: 'room-full' });
        return;
      }
      const player = {
        ws,
        username: String(message.username || 'playerini'),
        color: 'b',
      };
      room.players.push(player);
      room.locked = true;
      room.game = {
        board: createInitialBoard(),
        turn: 'w',
        enPassant: null,
        lastMove: null,
      };

      room.players.forEach((p) => {
        send(p.ws, {
          type: 'room_joined',
          room: room.name,
          color: p.color,
          username: p.username,
          state: 'playing',
        });
      });

      broadcast(room, {
        type: 'state',
        board: serializeBoard(room.game.board),
        turn: room.game.turn,
        lastMove: room.game.lastMove,
      });
    }

    if (message.type === 'move') {
      const room = rooms.get(String(message.room || '').trim());
      if (!room || !room.game) return;
      const player = room.players.find((p) => p.ws === ws);
      if (!player) return;

      const from = message.from;
      const to = message.to;
      if (!from || !to) return;

      const result = validateAndApplyMove(room.game, from, to, player.color);
      if (!result.ok) {
        send(ws, { type: 'error', reason: result.reason });
        return;
      }

      broadcast(room, {
        type: 'state',
        board: serializeBoard(room.game.board),
        turn: room.game.turn,
        lastMove: room.game.lastMove,
      });
    }
  });

  ws.on('close', () => handleDisconnect(ws));
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
