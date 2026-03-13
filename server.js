const express = require('express');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});
server.requestTimeout = 0;
server.keepAliveTimeout = 65000;

const DEFAULT_PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const uploadsRoot = path.join(__dirname, 'uploads');
const ROOM_ID_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_USERNAME_LENGTH = 24;
const MAX_CHAT_LENGTH = 300;
const MAX_VIDEO_SIZE_BYTES = Number(process.env.MAX_VIDEO_SIZE_BYTES || 8 * 1024 * 1024 * 1024);
const MAX_CAPTION_SIZE_BYTES = Number(process.env.MAX_CAPTION_SIZE_BYTES || 2 * 1024 * 1024);
const MAX_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;
const MOBILE_CHUNK_SIZE_BYTES = 2 * 1024 * 1024;
const DESKTOP_CHUNK_SIZE_BYTES = 8 * 1024 * 1024;

fs.mkdirSync(uploadsRoot, { recursive: true });

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const roomId = req.params.roomId;
    if (!isValidRoomId(roomId)) {
      cb(new Error('Invalid room ID.'));
      return;
    }
    const roomDir = path.join(uploadsRoot, roomId);
    fs.mkdirSync(roomDir, { recursive: true });
    cb(null, roomDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `host-video-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE_BYTES,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.mp4' && ext !== '.webm') {
      cb(new Error('Only MP4 and WEBM uploads are allowed.'));
      return;
    }
    cb(null, true);
  },
});

const captionUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const roomId = req.params.roomId;
      if (!isValidRoomId(roomId)) {
        cb(new Error('Invalid room ID.'));
        return;
      }
      const roomDir = path.join(uploadsRoot, roomId);
      fs.mkdirSync(roomDir, { recursive: true });
      cb(null, roomDir);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.txt';
      cb(null, `captions-${Date.now()}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_CAPTION_SIZE_BYTES,
  },
});

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';

  do {
    id = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(id));

  return id;
}

function normalizeUsername(value) {
  return String(value || '').trim().slice(0, MAX_USERNAME_LENGTH);
}

function isValidRoomId(roomId) {
  return ROOM_ID_PATTERN.test(String(roomId || ''));
}

function getRoomFromRequest(req, res) {
  const roomId = String(req.params.roomId || '').trim().toUpperCase();

  if (!isValidRoomId(roomId)) {
    res.status(400).json({ error: 'Invalid room ID.' });
    return null;
  }

  const room = rooms.get(roomId);
  if (!room) {
    res.status(404).json({ error: 'Room not found.' });
    return null;
  }

  return { room, roomId };
}

function createRoom(hostName) {
  const roomId = generateRoomId();
  const room = {
    id: roomId,
    hostName,
    users: new Map(),
    chat: [],
    screenShare: {
      active: false,
    },
    videoState: {
      videoUrl: '',
      provider: 'html5',
      title: '',
      mimeType: '',
      captionUrl: '',
      captionLabel: '',
      isPlaying: false,
      currentTime: 0,
      updatedAt: Date.now(),
    },
  };

  rooms.set(roomId, room);
  return room;
}

function getEffectiveVideoState(room) {
  const effectiveState = {
    videoUrl: room.videoState.videoUrl,
    provider: room.videoState.provider,
    title: room.videoState.title || '',
    mimeType: room.videoState.mimeType || '',
    captionUrl: room.videoState.captionUrl || '',
    captionLabel: room.videoState.captionLabel || '',
    isPlaying: room.videoState.isPlaying,
    currentTime: room.videoState.currentTime,
    updatedAt: room.videoState.updatedAt,
  };

  if (effectiveState.isPlaying) {
    const elapsedSeconds = Math.max(0, (Date.now() - effectiveState.updatedAt) / 1000);
    effectiveState.currentTime += elapsedSeconds;
  }

  return effectiveState;
}

function serializeRoom(room) {
  const users = Array.from(room.users.values()).map((user) => ({
    id: user.id,
    username: user.username,
    isHost: user.username === room.hostName,
  }));
  const videoState = getEffectiveVideoState(room);

  return {
    id: room.id,
    hostName: room.hostName,
    users,
    chat: room.chat,
    screenShare: room.screenShare,
    videoState,
  };
}

function resetRoomToHtml5Video(room, videoUrl) {
  room.videoState = {
    videoUrl,
    provider: 'html5',
    title: '',
    mimeType: '',
    captionUrl: '',
    captionLabel: '',
    isPlaying: false,
    currentTime: 0,
    updatedAt: Date.now(),
  };
}

function getMimeTypeForExtension(ext) {
  if (ext === '.mp4') {
    return 'video/mp4';
  }

  if (ext === '.webm') {
    return 'video/webm';
  }

  return 'application/octet-stream';
}

function getChunkDir(roomId, uploadId) {
  return path.join(uploadsRoot, roomId, `.chunks-${uploadId}`);
}

function sanitizeUploadId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function getRecommendedChunkSize(req) {
  const userAgent = String(req.get('user-agent') || '').toLowerCase();
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(userAgent);
  return isMobile ? MOBILE_CHUNK_SIZE_BYTES : DESKTOP_CHUNK_SIZE_BYTES;
}

function streamTextFile(req, res, filePath, mimeType) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    res.status(404).json({ error: 'Caption file not found.' });
    return;
  }

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
}

async function cleanupRoomFiles(roomDir, predicate, keepFileName) {
  try {
    const fileNames = await fs.promises.readdir(roomDir);
    await Promise.all(
      fileNames.map(async (fileName) => {
        if (!predicate(fileName) || fileName === keepFileName) {
          return;
        }

        try {
          await fs.promises.unlink(path.join(roomDir, fileName));
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.error(`Failed to remove stale room file ${fileName}:`, error);
          }
        }
      }),
    );
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Failed to clean room files in ${roomDir}:`, error);
    }
  }
}

async function appendFileToStream(sourcePath, writeStream) {
  await new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(sourcePath);
    readStream.on('error', reject);
    writeStream.on('error', reject);
    readStream.on('end', resolve);
    readStream.pipe(writeStream, { end: false });
  });
}

function normalizeCaptionFileToVtt(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (raw.includes('\u0000')) {
    throw new Error('Caption file must be a text-based subtitle file.');
  }

  let content = raw.replace(/\r\n/g, '\n').trim();
  if (!content) {
    throw new Error('Caption file is empty.');
  }

  if (!content.startsWith('WEBVTT')) {
    const lines = content.split('\n');
    const normalizedLines = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index].trimEnd();
      const nextLine = lines[index + 1] ? lines[index + 1].trim() : '';
      const looksLikeCueIndex = /^\d+$/.test(line.trim()) && /-->/.test(nextLine);

      if (looksLikeCueIndex) {
        continue;
      }

      normalizedLines.push(line.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2'));
    }

    content = `WEBVTT\n\n${normalizedLines.join('\n').trim()}`;
  }

  const normalizedPath = `${filePath}.normalized.vtt`;
  fs.writeFileSync(normalizedPath, `${content}\n`, 'utf8');
  fs.unlinkSync(filePath);
  return normalizedPath;
}

function streamVideoFile(req, res, filePath, mimeType) {
  let stats;

  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    res.status(404).json({ error: 'Video file not found.' });
    return;
  }

  const fileSize = stats.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'no-store');

  if (!range) {
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    res.status(416).end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileSize - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= fileSize || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
    res.end();
    return;
  }

  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

function pushSystemMessage(room, roomId, messageText) {
  const message = {
    id: `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'system',
    message: messageText,
    createdAt: new Date().toISOString(),
  };

  room.chat.push(message);
  io.to(roomId).emit('chat-message', message);
  return message;
}

function roomInviteLink(roomId, req) {
  return `${req.protocol}://${req.get('host')}/room/${roomId}`;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

app.post('/api/rooms', (req, res) => {
  const username = normalizeUsername(req.body && req.body.username);

  if (!username) {
    return res.status(400).json({ error: 'Username is required.' });
  }

  const room = createRoom(username);
  return res.json({
    roomId: room.id,
    inviteLink: roomInviteLink(room.id, req),
    hostName: room.hostName,
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }
  const { room, roomId } = roomEntry;

  return res.json({
    roomId,
    hostName: room.hostName,
    inviteLink: roomInviteLink(roomId, req),
    videoState: serializeRoom(room).videoState,
    userCount: room.users.size,
  });
});

app.get('/api/rooms/:roomId/video', (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }

  const { room } = roomEntry;

  if (room.videoState.provider !== 'html5' || !room.videoState.filePath) {
    return res.status(404).json({ error: 'No uploaded video is available for this room.' });
  }

  return streamVideoFile(req, res, room.videoState.filePath, room.videoState.mimeType || 'application/octet-stream');
});

app.get('/api/rooms/:roomId/captions', (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }

  const { room } = roomEntry;
  if (!room.videoState.captionPath) {
    return res.status(404).json({ error: 'No captions are available for this room.' });
  }

  return streamTextFile(req, res, room.videoState.captionPath, 'text/vtt; charset=utf-8');
});

app.post('/api/rooms/:roomId/upload/init', async (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }

  const { room, roomId } = roomEntry;
  const username = normalizeUsername(req.headers['x-username']);
  const originalName = String(req.body && req.body.originalName || '').trim();
  const fileSize = Number(req.body && req.body.fileSize);
  const ext = path.extname(originalName).toLowerCase();

  if (!username || username !== room.hostName) {
    return res.status(403).json({ error: 'Only the host can upload a video.' });
  }

  if (!originalName || !Number.isFinite(fileSize) || fileSize <= 0) {
    return res.status(400).json({ error: 'Video metadata is required.' });
  }

  if (fileSize > MAX_VIDEO_SIZE_BYTES) {
    return res.status(400).json({ error: 'Video file is too large.' });
  }

  if (ext !== '.mp4' && ext !== '.webm') {
    return res.status(400).json({ error: 'Only MP4 and WEBM uploads are allowed.' });
  }

  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const chunkDir = getChunkDir(roomId, uploadId);
  await fs.promises.mkdir(chunkDir, { recursive: true });

  return res.json({
    uploadId,
    chunkSize: getRecommendedChunkSize(req),
  });
});

app.post('/api/rooms/:roomId/upload/chunk', express.raw({ type: 'application/octet-stream', limit: `${MAX_CHUNK_SIZE_BYTES}b` }), async (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }

  const { room, roomId } = roomEntry;
  const username = normalizeUsername(req.headers['x-username']);
  const uploadId = sanitizeUploadId(req.headers['x-upload-id']);
  const chunkIndex = Number(req.headers['x-chunk-index']);

  if (!username || username !== room.hostName) {
    return res.status(403).json({ error: 'Only the host can upload a video.' });
  }

  if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Invalid chunk upload.' });
  }

  const chunkDir = getChunkDir(roomId, uploadId);
  await fs.promises.mkdir(chunkDir, { recursive: true });
  await fs.promises.writeFile(path.join(chunkDir, `${chunkIndex}.part`), req.body);
  return res.json({ ok: true });
});

app.post('/api/rooms/:roomId/upload/complete', async (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }

  const { room, roomId } = roomEntry;
  const username = normalizeUsername(req.headers['x-username']);
  const uploadId = sanitizeUploadId(req.body && req.body.uploadId);
  const originalName = String(req.body && req.body.originalName || '').trim();
  const totalChunks = Number(req.body && req.body.totalChunks);
  const fileSize = Number(req.body && req.body.fileSize);

  if (!username || username !== room.hostName) {
    return res.status(403).json({ error: 'Only the host can upload a video.' });
  }

  if (!uploadId || !originalName || !Number.isInteger(totalChunks) || totalChunks <= 0 || !Number.isFinite(fileSize)) {
    return res.status(400).json({ error: 'Upload completion metadata is invalid.' });
  }

  const ext = path.extname(originalName).toLowerCase();
  if (ext !== '.mp4' && ext !== '.webm') {
    return res.status(400).json({ error: 'Only MP4 and WEBM uploads are allowed.' });
  }

  const roomDir = path.join(uploadsRoot, roomId);
  const chunkDir = getChunkDir(roomId, uploadId);
  const finalFileName = `host-video-${Date.now()}${ext}`;
  const finalFilePath = path.join(roomDir, finalFileName);
  const writeStream = fs.createWriteStream(finalFilePath);

  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const partPath = path.join(chunkDir, `${index}.part`);
      await appendFileToStream(partPath, writeStream);
    }
  } catch (error) {
    writeStream.destroy();
    try {
      await fs.promises.unlink(finalFilePath);
    } catch (cleanupError) {}
    return res.status(400).json({ error: 'Upload assembly failed. Please retry.' });
  }

  await new Promise((resolve, reject) => {
    writeStream.end((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const videoUrl = `/api/rooms/${roomId}/video`;
  resetRoomToHtml5Video(room, videoUrl);
  room.videoState.filePath = finalFilePath;
  room.videoState.mimeType = getMimeTypeForExtension(ext);
  room.videoState.title = originalName;
  const publicVideoState = getEffectiveVideoState(room);

  pushSystemMessage(room, roomId, `${username} uploaded a new video.`);
  io.to(roomId).emit('video-changed', publicVideoState);
  io.to(roomId).emit('room-state', serializeRoom(room));

  void cleanupRoomFiles(roomDir, (fileName) => fileName.startsWith('host-video-'), finalFileName);
  void fs.promises.rm(chunkDir, { recursive: true, force: true });

  return res.json({
    videoUrl,
    videoState: publicVideoState,
  });
});

app.post('/api/rooms/:roomId/upload', (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }
  const { room, roomId } = roomEntry;
  const username = normalizeUsername(req.headers['x-username']);

  if (!username || username !== room.hostName) {
    return res.status(403).json({ error: 'Only the host can upload a video.' });
  }

  upload.single('video')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'Upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Video file is required.' });
    }

    const roomDir = path.join(uploadsRoot, roomId);
    const currentFile = path.basename(req.file.path);

    const ext = path.extname(currentFile).toLowerCase();
    const videoUrl = `/api/rooms/${roomId}/video`;
    resetRoomToHtml5Video(room, videoUrl);
    room.videoState.filePath = req.file.path;
    room.videoState.mimeType = req.file.mimetype || getMimeTypeForExtension(ext);
    room.videoState.title = req.file.originalname;
    const publicVideoState = getEffectiveVideoState(room);

    pushSystemMessage(room, roomId, `${username} uploaded a new video.`);
    io.to(roomId).emit('video-changed', publicVideoState);
    io.to(roomId).emit('room-state', serializeRoom(room));

    void cleanupRoomFiles(roomDir, (fileName) => fileName.startsWith('host-video-'), currentFile);

    return res.json({
      videoUrl,
      videoState: publicVideoState,
    });
  });
});

app.post('/api/rooms/:roomId/captions', (req, res) => {
  const roomEntry = getRoomFromRequest(req, res);
  if (!roomEntry) {
    return;
  }
  const { room, roomId } = roomEntry;
  const username = normalizeUsername(req.headers['x-username']);

  if (!username || username !== room.hostName) {
    return res.status(403).json({ error: 'Only the host can upload captions.' });
  }

  captionUpload.single('captions')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message || 'Caption upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Caption file is required.' });
    }

    const roomDir = path.join(uploadsRoot, roomId);
    let normalizedCaptionPath;

    try {
      normalizedCaptionPath = normalizeCaptionFileToVtt(req.file.path);
    } catch (captionError) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {}
      return res.status(400).json({ error: captionError.message || 'Caption upload failed.' });
    }

    const currentFile = path.basename(normalizedCaptionPath);

    room.videoState.captionPath = normalizedCaptionPath;
    room.videoState.captionUrl = `/api/rooms/${roomId}/captions`;
    room.videoState.captionLabel = req.file.originalname;

    const publicVideoState = getEffectiveVideoState(room);
    pushSystemMessage(room, roomId, `${username} uploaded captions.`);
    io.to(roomId).emit('video-changed', publicVideoState);
    io.to(roomId).emit('room-state', serializeRoom(room));
    void cleanupRoomFiles(roomDir, (fileName) => fileName.startsWith('captions-'), currentFile);

    return res.json({
      videoState: publicVideoState,
    });
  });
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {
    const cleanRoomId = String(roomId || '').trim().toUpperCase();
    const cleanName = normalizeUsername(username);

    if (!isValidRoomId(cleanRoomId)) {
      socket.emit('room-error', { message: 'Invalid room ID.' });
      return;
    }

    const room = rooms.get(cleanRoomId);
    if (!room) {
      socket.emit('room-error', { message: 'Room not found.' });
      return;
    }

    if (!cleanName) {
      socket.emit('room-error', { message: 'Login is required before joining a room.' });
      return;
    }

    socket.join(cleanRoomId);
    socket.data.roomId = cleanRoomId;
    socket.data.username = cleanName;
    room.users.set(socket.id, { id: socket.id, username: cleanName });

    const joinedNotice = {
      id: `notice-${Date.now()}`,
      type: 'system',
      message: `${cleanName} joined the room.`,
      createdAt: new Date().toISOString(),
    };

    room.chat.push(joinedNotice);
    io.to(cleanRoomId).emit('room-state', serializeRoom(room));
    io.to(cleanRoomId).emit('system-message', joinedNotice);
  });

  socket.on('chat-message', ({ text }) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    const room = rooms.get(roomId);

    if (!room || !username) {
      return;
    }

    const cleanText = String(text || '').trim().slice(0, MAX_CHAT_LENGTH);
    if (!cleanText) {
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'user',
      username,
      text: cleanText,
      createdAt: new Date().toISOString(),
    };

    room.chat.push(message);
    io.to(roomId).emit('chat-message', message);
  });

  socket.on('video-action', ({ action, currentTime }) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    const room = rooms.get(roomId);

    if (!room || username !== room.hostName) {
      return;
    }

    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      room.videoState.currentTime = currentTime;
    }

    if (action === 'play') {
      room.videoState.isPlaying = true;
    }

    if (action === 'pause') {
      room.videoState.isPlaying = false;
    }

    if (action === 'seek') {
      room.videoState.currentTime = typeof currentTime === 'number' && Number.isFinite(currentTime) ? currentTime : 0;
    }

    room.videoState.updatedAt = Date.now();
    socket.to(roomId).emit('video-action', {
      action,
      currentTime: room.videoState.currentTime,
      updatedAt: room.videoState.updatedAt,
    });
  });

  socket.on('screen-share-status', ({ active }) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    const room = rooms.get(roomId);

    if (!room || username !== room.hostName) {
      return;
    }

    room.screenShare.active = Boolean(active);
    io.to(roomId).emit('screen-share-status', {
      active: room.screenShare.active,
      hostName: room.hostName,
    });
    io.to(roomId).emit('room-state', serializeRoom(room));
  });

  socket.on('screen-share-offer', ({ targetSocketId, description }) => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    const room = rooms.get(roomId);

    if (!room || username !== room.hostName || !targetSocketId || !description) {
      return;
    }

    io.to(targetSocketId).emit('screen-share-offer', {
      fromSocketId: socket.id,
      description,
    });
  });

  socket.on('screen-share-answer', ({ targetSocketId, description }) => {
    if (!targetSocketId || !description) {
      return;
    }

    io.to(targetSocketId).emit('screen-share-answer', {
      fromSocketId: socket.id,
      description,
    });
  });

  socket.on('screen-share-ice-candidate', ({ targetSocketId, candidate }) => {
    if (!targetSocketId || !candidate) {
      return;
    }

    io.to(targetSocketId).emit('screen-share-ice-candidate', {
      fromSocketId: socket.id,
      candidate,
    });
  });

  socket.on('request-screen-share', () => {
    const roomId = socket.data.roomId;
    const room = rooms.get(roomId);

    if (!room || !room.screenShare.active) {
      return;
    }

    const hostEntry = Array.from(room.users.entries()).find(([, user]) => user.username === room.hostName);
    if (!hostEntry) {
      return;
    }

    const [hostSocketId] = hostEntry;
    io.to(hostSocketId).emit('screen-share-request', {
      viewerSocketId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const username = socket.data.username;
    const room = rooms.get(roomId);

    if (!room) {
      return;
    }

    room.users.delete(socket.id);

    if (username === room.hostName && room.screenShare.active) {
      room.screenShare.active = false;
      io.to(roomId).emit('screen-share-status', {
        active: false,
        hostName: room.hostName,
      });
    }

    if (username) {
      const leftNotice = {
        id: `leave-${Date.now()}`,
        type: 'system',
        message: `${username} left the room.`,
        createdAt: new Date().toISOString(),
      };
      room.chat.push(leftNotice);
      io.to(roomId).emit('system-message', leftNotice);
    }

    if (room.users.size === 0) {
      rooms.delete(roomId);
      return;
    }

    if (username === room.hostName) {
      const nextHost = room.users.values().next().value;
      room.hostName = nextHost.username;
      const hostNotice = {
        id: `host-${Date.now()}`,
        type: 'system',
        message: `${room.hostName} is now the host.`,
        createdAt: new Date().toISOString(),
      };
      room.chat.push(hostNotice);
      io.to(roomId).emit('system-message', hostNotice);
    }

    io.to(roomId).emit('room-state', serializeRoom(room));
  });
});

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const tester = net.createServer();

      tester.once('error', (error) => {
        tester.close();
        if (error.code === 'EADDRINUSE') {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });

      tester.once('listening', () => {
        tester.close(() => resolve(port));
      });

      tester.listen(port);
    };

    tryPort(startPort);
  });
}

async function startServer() {
  const port = await findAvailablePort(DEFAULT_PORT);
  if (port !== DEFAULT_PORT) {
    console.warn(`Port ${DEFAULT_PORT} is in use. Using port ${port} instead.`);
  }

  server.listen(port, () => {
    console.log(`Watch party server running on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  throw error;
});
