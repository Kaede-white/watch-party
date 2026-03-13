(function () {
  const USERNAME_KEY = 'watchPartyUsername';
  let socket = null;
  let suppressVideoEvent = false;
  let seenMessageIds = new Set();
  let currentRoomState = null;
  let localScreenStream = null;
  let screenSharePeers = new Map();
  let viewerPeer = null;
  let lastRenderedChatId = '';
  let lastAppliedVideoKey = '';
  const rtcConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  function isMobileDevice() {
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
  }

  function getUsername() {
    return localStorage.getItem(USERNAME_KEY) || sessionStorage.getItem(USERNAME_KEY) || '';
  }

  function setUsername(username) {
    localStorage.setItem(USERNAME_KEY, username);
    sessionStorage.setItem(USERNAME_KEY, username);
  }

  function requireLogin() {
    const username = getUsername();
    if (!username) {
      window.location.href = '/';
      return '';
    }
    return username;
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(function () {
      toast.remove();
    }, 2800);
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) {
      return '--:--';
    }

    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remaining = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
    }

    return `${minutes}:${String(remaining).padStart(2, '0')}`;
  }

  function extractRoomId(input) {
    try {
      const url = new URL(input, window.location.origin);
      const parts = url.pathname.split('/').filter(Boolean);
      return parts[0] === 'room' ? String(parts[1] || '').toUpperCase() : '';
    } catch (error) {
      return '';
    }
  }

  function isValidRoomId(roomId) {
    return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(String(roomId || ''));
  }

  function setVideoTime(video, time) {
    if (typeof time !== 'number' || !Number.isFinite(time)) {
      return;
    }

    const applyTime = function () {
      suppressVideoEvent = true;
      try {
        video.currentTime = time;
      } catch (error) {
        // Ignore timing errors until metadata is ready.
      }
      suppressVideoEvent = false;
    };

    if (video.readyState >= 1) {
      applyTime();
      return;
    }

    video.addEventListener('loadedmetadata', applyTime, { once: true });
  }

  function appendMessage(message) {
    if (message.id && seenMessageIds.has(message.id)) {
      return;
    }

    if (message.id) {
      seenMessageIds.add(message.id);
    }

    const container = document.getElementById('chat-messages');
    if (!container) {
      return;
    }

    const item = document.createElement('article');
    item.className = `chat-message ${message.type === 'system' ? 'system' : ''}`;

    const meta = document.createElement('div');
    meta.className = 'chat-meta';

    const label = document.createElement('strong');
    label.textContent = message.type === 'system' ? 'System' : message.username;
    meta.appendChild(label);

    const stamp = document.createElement('span');
    stamp.textContent = formatTime(message.createdAt);
    meta.appendChild(stamp);

    const body = document.createElement('div');
    body.textContent = message.type === 'system' ? message.message : message.text;

    item.appendChild(meta);
    item.appendChild(body);
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
  }

  function renderChat(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) {
      return;
    }

    container.innerHTML = '';
    seenMessageIds = new Set();
    messages.forEach(appendMessage);
    lastRenderedChatId = messages.length ? messages[messages.length - 1].id || '' : '';
  }

  function renderUsers(room) {
    const userList = document.getElementById('user-list');
    const userCount = document.getElementById('user-count');
    const hostBadge = document.getElementById('host-badge');

    userList.innerHTML = '';
    userCount.textContent = String(room.users.length);
    hostBadge.textContent = room.hostName;

    room.users.forEach(function (user) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = user.username;
      item.appendChild(name);

      if (user.isHost) {
        const badge = document.createElement('span');
        badge.className = 'host-tag';
        badge.textContent = 'Host';
        item.appendChild(badge);
      }

      userList.appendChild(item);
    });
  }

  function setHostControls(enabled) {
    const video = document.getElementById('html5-player');
    const overlay = document.getElementById('viewer-overlay');
    const uploadInput = document.getElementById('video-file-input');
    const captionInput = document.getElementById('caption-file-input');
    const uploadButton = document.querySelector('.upload-button');
    const captionButton = document.querySelector('.caption-upload-button');
    const shareButton = document.getElementById('share-screen-btn');
    const stopShareButton = document.getElementById('stop-share-btn');

    if (!video || !overlay || !uploadInput || !captionInput || !uploadButton || !captionButton || !shareButton || !stopShareButton) {
      return;
    }

    video.controls = enabled;
    uploadInput.disabled = !enabled;
    captionInput.disabled = !enabled;
    uploadButton.classList.toggle('hidden', !enabled);
    captionButton.classList.toggle('hidden', !enabled);
    shareButton.classList.toggle('hidden', !enabled);
    stopShareButton.classList.toggle('hidden', !enabled || !(currentRoomState && currentRoomState.screenShare && currentRoomState.screenShare.active));
    overlay.classList.toggle('hidden', enabled);
  }

  function setUploadProgress(message, visible) {
    const progress = document.getElementById('upload-progress-text');
    if (!progress) {
      return;
    }

    progress.textContent = message || '';
    progress.classList.toggle('hidden', !visible);
  }

  function updateScreenShareUI(active, hostName) {
    const shell = document.getElementById('screen-share-shell');
    const state = document.getElementById('screen-share-state');
    const title = document.getElementById('screen-share-title');
    const shareButton = document.getElementById('share-screen-btn');
    const stopShareButton = document.getElementById('stop-share-btn');

    if (!shell || !state || !title || !shareButton || !stopShareButton) {
      return;
    }

    if (active) {
      shell.classList.remove('hidden');
      state.textContent = 'Live';
      title.textContent = `${hostName || 'Host'} screen`;
    } else {
      shell.classList.add('hidden');
      state.textContent = 'Inactive';
      title.textContent = 'Host screen';
    }

    if (currentRoomState && currentRoomState.screenShare) {
      currentRoomState.screenShare.active = active;
    }

    const isCurrentHost = Boolean(currentRoomState) && currentRoomState.hostName === getUsername();
    shareButton.classList.toggle('hidden', !isCurrentHost || active);
    stopShareButton.classList.toggle('hidden', !isCurrentHost || !active);
  }

  function resetScreenShareVideo() {
    const player = document.getElementById('screen-share-player');
    if (!player) {
      return;
    }

    player.pause();
    player.srcObject = null;
  }

  function closePeerConnection(peer) {
    if (!peer) {
      return;
    }

    peer.onicecandidate = null;
    peer.ontrack = null;
    peer.close();
  }

  function stopHostScreenShare(announce) {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach(function (track) {
        track.stop();
      });
      localScreenStream = null;
    }

    screenSharePeers.forEach(closePeerConnection);
    screenSharePeers.clear();
    resetScreenShareVideo();
    updateScreenShareUI(false, currentRoomState && currentRoomState.hostName);

    if (announce && socket) {
      socket.emit('screen-share-status', { active: false });
    }
  }

  async function startHostScreenShare() {
    if (localScreenStream) {
      return;
    }

    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    } catch (error) {
      showToast('Screen share was canceled.');
      return;
    }

    localScreenStream.getAudioTracks().forEach(function (track) {
      track.enabled = false;
      track.stop();
    });

    const videoTrack = localScreenStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.addEventListener('ended', function () {
        stopHostScreenShare(true);
      });
    }

    document.getElementById('screen-share-player').srcObject = localScreenStream;
    updateScreenShareUI(true, currentRoomState && currentRoomState.hostName);
    socket.emit('screen-share-status', { active: true });
  }

  async function createHostPeerForViewer(viewerSocketId) {
    if (!localScreenStream || !socket) {
      return;
    }

    const existingPeer = screenSharePeers.get(viewerSocketId);
    if (existingPeer) {
      closePeerConnection(existingPeer);
    }

    const peer = new RTCPeerConnection(rtcConfig);
    screenSharePeers.set(viewerSocketId, peer);

    localScreenStream.getVideoTracks().forEach(function (track) {
      peer.addTrack(track, localScreenStream);
    });

    peer.onicecandidate = function (event) {
      if (event.candidate) {
        socket.emit('screen-share-ice-candidate', {
          targetSocketId: viewerSocketId,
          candidate: event.candidate,
        });
      }
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket.emit('screen-share-offer', {
      targetSocketId: viewerSocketId,
      description: peer.localDescription,
    });
  }

  async function handleViewerOffer(fromSocketId, description) {
    if (viewerPeer) {
      closePeerConnection(viewerPeer);
      viewerPeer = null;
    }

    viewerPeer = new RTCPeerConnection(rtcConfig);

    viewerPeer.ontrack = function (event) {
      const [stream] = event.streams;
      const player = document.getElementById('screen-share-player');
      player.srcObject = stream;
      player.muted = true;
      player.play().catch(function () {});
    };

    viewerPeer.onicecandidate = function (event) {
      if (event.candidate) {
        socket.emit('screen-share-ice-candidate', {
          targetSocketId: fromSocketId,
          candidate: event.candidate,
        });
      }
    };

    await viewerPeer.setRemoteDescription(description);
    const answer = await viewerPeer.createAnswer();
    await viewerPeer.setLocalDescription(answer);
    socket.emit('screen-share-answer', {
      targetSocketId: fromSocketId,
      description: viewerPeer.localDescription,
    });
  }

  function updateStreamMeta(videoState) {
    const title = document.getElementById('video-title');
    const hint = document.getElementById('stream-hint');
    const captionHint = document.getElementById('caption-hint');

    if (!title || !hint || !captionHint) {
      return;
    }

    if (!videoState.videoUrl) {
      title.textContent = 'No file uploaded yet';
      hint.textContent = 'Host uploads one MP4 or WEBM file. Everyone watches the same stream URL.';
      captionHint.textContent = 'Supported: MP4, WEBM and WebVTT captions. Optimized for multi-hour files via HTTP byte-range streaming.';
      return;
    }

    title.textContent = videoState.title || 'Shared upload';
    hint.textContent = videoState.isPlaying
      ? `Live playback in progress at ${formatDuration(videoState.currentTime)}.`
      : `Paused at ${formatDuration(videoState.currentTime)}. Late joiners start from the synchronized timestamp.`;
    captionHint.textContent = videoState.captionUrl
      ? `Captions loaded: ${videoState.captionLabel || 'WebVTT track'}.`
      : 'No captions uploaded yet. Host can add a subtitle file and the server will normalize it for playback.';
  }

  function syncCaptionTrack(videoState) {
    const video = document.getElementById('html5-player');
    let track = document.getElementById('caption-track');

    if (!videoState.captionUrl) {
      if (track) {
        track.remove();
      }
      return;
    }

    if (!track) {
      track = document.createElement('track');
      track.id = 'caption-track';
      track.kind = 'captions';
      track.srclang = 'en';
      track.default = true;
      video.appendChild(track);
    }

    if (track.src !== window.location.origin + videoState.captionUrl) {
      track.src = videoState.captionUrl;
    }
    track.label = videoState.captionLabel || 'English';
  }

  function syncPlaybackState(videoState) {
    const video = document.getElementById('html5-player');

    if (videoState.isPlaying) {
      const playWhenReady = function () {
        video.play().catch(function () {});
      };

      if (video.readyState >= 2) {
        playWhenReady();
        return;
      }

      video.addEventListener('canplay', playWhenReady, { once: true });
      return;
    }

    video.pause();
  }

  function bindPlaybackRecovery(isHost) {
    const video = document.getElementById('html5-player');

    function attemptRecovery() {
      if (isHost() || !currentRoomState || !currentRoomState.videoState.videoUrl) {
        return;
      }

      if (currentRoomState.videoState.isPlaying) {
        setVideoTime(video, currentRoomState.videoState.currentTime || 0);
        video.play().catch(function () {});
      }
    }

    video.addEventListener('waiting', function () {
      if (isMobileDevice()) {
        attemptRecovery();
      }
    });

    video.addEventListener('stalled', function () {
      if (isMobileDevice()) {
        video.load();
        attemptRecovery();
      }
    });
  }

  function loadVideo(videoState) {
    const video = document.getElementById('html5-player');
    const placeholder = document.getElementById('player-placeholder');

    updateStreamMeta(videoState);

    const nextVideoKey = JSON.stringify({
      url: videoState.videoUrl,
      captionUrl: videoState.captionUrl || '',
      isPlaying: Boolean(videoState.isPlaying),
      currentTime: Math.floor((videoState.currentTime || 0) * 2) / 2,
    });

    if (lastAppliedVideoKey === nextVideoKey) {
      return;
    }

    if (!videoState.videoUrl) {
      video.removeAttribute('src');
      video.removeAttribute('data-stream-url');
      video.load();
      syncCaptionTrack(videoState);
      placeholder.classList.remove('hidden');
      lastAppliedVideoKey = nextVideoKey;
      return;
    }

    placeholder.classList.add('hidden');

    if (video.dataset.streamUrl !== videoState.videoUrl) {
      suppressVideoEvent = true;
      video.pause();
      video.src = videoState.videoUrl;
      video.dataset.streamUrl = videoState.videoUrl;
      suppressVideoEvent = false;
    }

    setVideoTime(video, videoState.currentTime || 0);
    syncCaptionTrack(videoState);
    syncPlaybackState(videoState);
    lastAppliedVideoKey = nextVideoKey;
  }

  function applyRemoteVideoAction(action, currentTime) {
    const video = document.getElementById('html5-player');

    suppressVideoEvent = true;
    if (typeof currentTime === 'number' && Number.isFinite(currentTime) && Math.abs(video.currentTime - currentTime) > 1.2) {
      setVideoTime(video, currentTime);
    }

    if (action === 'play') {
      video.play().catch(function () {});
    }

    if (action === 'pause') {
      video.pause();
    }

    suppressVideoEvent = false;
  }

  function updateRoomVideoState(action, currentTime) {
    if (!currentRoomState) {
      return;
    }

    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      currentRoomState.videoState.currentTime = currentTime;
    }

    if (action === 'play') {
      currentRoomState.videoState.isPlaying = true;
    }

    if (action === 'pause') {
      currentRoomState.videoState.isPlaying = false;
    }

    updateStreamMeta(currentRoomState.videoState);
  }

  function bindHtml5Events(isHost) {
    const video = document.getElementById('html5-player');

    video.addEventListener('play', function () {
      if (!isHost() || suppressVideoEvent) {
        return;
      }
      updateRoomVideoState('play', video.currentTime);
      socket.emit('video-action', { action: 'play', currentTime: video.currentTime });
    });

    video.addEventListener('pause', function () {
      if (!isHost() || suppressVideoEvent) {
        return;
      }
      updateRoomVideoState('pause', video.currentTime);
      socket.emit('video-action', { action: 'pause', currentTime: video.currentTime });
    });

    video.addEventListener('seeked', function () {
      if (!isHost() || suppressVideoEvent) {
        return;
      }
      updateRoomVideoState('seek', video.currentTime);
      socket.emit('video-action', { action: 'seek', currentTime: video.currentTime });
    });
  }

  async function toggleFullscreen() {
    const playerStage = document.querySelector('.player-stage');
    if (!playerStage) {
      return;
    }

    if (document.fullscreenElement === playerStage) {
      await document.exitFullscreen();
      return;
    }

    if (playerStage.requestFullscreen) {
      await playerStage.requestFullscreen();
    }
  }

  async function uploadVideoInChunks(roomId, username, file) {
    const initResponse = await fetch(`/api/rooms/${roomId}/upload/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-username': username,
      },
      body: JSON.stringify({
        originalName: file.name,
        fileSize: file.size,
      }),
    });
    const initData = await initResponse.json();

    if (!initResponse.ok) {
      throw new Error(initData.error || 'Upload initialization failed.');
    }

    const chunkSize = initData.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const maxParallel = isMobileDevice() ? 2 : 4;
    let completedChunks = 0;
    let nextChunkIndex = 0;

    async function uploadSingleChunk(index) {
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const chunk = await file.slice(start, end).arrayBuffer();

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const chunkResponse = await fetch(`/api/rooms/${roomId}/upload/chunk`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-username': username,
            'x-upload-id': initData.uploadId,
            'x-chunk-index': String(index),
          },
          body: chunk,
        });
        const chunkData = await chunkResponse.json();

        if (chunkResponse.ok) {
          completedChunks += 1;
          const percent = Math.round((completedChunks / totalChunks) * 100);
          setUploadProgress(`Uploading video... ${percent}%`, true);
          return;
        }

        if (attempt === 2) {
          throw new Error(chunkData.error || 'Chunk upload failed.');
        }
      }
    }

    async function worker() {
      while (nextChunkIndex < totalChunks) {
        const currentIndex = nextChunkIndex;
        nextChunkIndex += 1;
        await uploadSingleChunk(currentIndex);
      }
    }

    await Promise.all(Array.from({ length: Math.min(maxParallel, totalChunks) }, worker));

    const completeResponse = await fetch(`/api/rooms/${roomId}/upload/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-username': username,
      },
      body: JSON.stringify({
        uploadId: initData.uploadId,
        originalName: file.name,
        totalChunks,
        fileSize: file.size,
      }),
    });
    const completeData = await completeResponse.json();

    if (!completeResponse.ok) {
      throw new Error(completeData.error || 'Upload completion failed.');
    }

    return completeData;
  }

  function onLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) {
      return;
    }

    const input = document.getElementById('username-input');
    const existing = getUsername();
    if (existing) {
      input.value = existing;
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const username = input.value.trim();

      if (!username) {
        showToast('Username is required.');
        return;
      }

      setUsername(username);
      window.location.href = '/dashboard';
    });
  }

  function onDashboardPage() {
    const username = requireLogin();
    if (!username) {
      return;
    }

    const welcomeCopy = document.getElementById('welcome-copy');
    welcomeCopy.textContent = `Signed in as ${username}. Create a host room or join a shared screening through its invite link.`;

    document.getElementById('create-room-btn').addEventListener('click', async function () {
      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username }),
        });
        const data = await response.json();

        if (!response.ok) {
          showToast(data.error || 'Unable to create room.');
          return;
        }

        window.location.href = `/room/${data.roomId}`;
      } catch (error) {
        showToast('Unable to create room.');
      }
    });

    document.getElementById('join-room-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const roomId = extractRoomId(document.getElementById('invite-link-input').value.trim());

      if (!isValidRoomId(roomId)) {
        showToast('Paste a valid invite link.');
        return;
      }

      window.location.href = `/room/${roomId}`;
    });
  }

  function onRoomPage() {
    const username = requireLogin();
    if (!username) {
      return;
    }

    const roomId = String(window.location.pathname.split('/').filter(Boolean)[1] || '').toUpperCase();
    if (!isValidRoomId(roomId)) {
      showToast('Invalid room link.');
      window.location.href = '/dashboard';
      return;
    }

    const isHost = function () {
      return Boolean(currentRoomState) && currentRoomState.hostName === username;
    };

    document.getElementById('room-title').textContent = `Room ${roomId}`;
    document.getElementById('invite-link-display').value = window.location.href;

    document.getElementById('copy-invite-btn').addEventListener('click', async function () {
      try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Invite link copied.');
      } catch (error) {
        showToast('Copy failed. Copy the link manually.');
      }
    });

    document.getElementById('fullscreen-btn').addEventListener('click', function () {
      toggleFullscreen().catch(function () {
        showToast('Fullscreen is not available right now.');
      });
    });

    document.getElementById('leave-room-btn').addEventListener('click', function () {
      if (isHost()) {
        stopHostScreenShare(true);
      }
      if (viewerPeer) {
        closePeerConnection(viewerPeer);
        viewerPeer = null;
      }
      if (socket) {
        socket.disconnect();
      }
      window.location.href = '/dashboard';
    });

    document.getElementById('share-screen-btn').addEventListener('click', async function () {
      if (!isHost()) {
        showToast('Only the host can share a screen.');
        return;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showToast('Screen sharing is not supported in this browser.');
        return;
      }
      await startHostScreenShare();
    });

    document.getElementById('stop-share-btn').addEventListener('click', function () {
      if (!isHost()) {
        return;
      }
      stopHostScreenShare(true);
    });

    document.getElementById('video-file-input').addEventListener('change', async function (event) {
      if (!isHost()) {
        showToast('Only the host can upload a video.');
        event.target.value = '';
        return;
      }

      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      try {
        setUploadProgress('Preparing upload...', true);
        await uploadVideoInChunks(roomId, username, file);
        showToast('Video uploaded and streamed to the room.');
      } catch (error) {
        showToast(error.message || 'Upload failed.');
      } finally {
        setUploadProgress('', false);
        event.target.value = '';
      }
    });

    document.getElementById('caption-file-input').addEventListener('change', async function (event) {
      if (!isHost()) {
        showToast('Only the host can upload captions.');
        event.target.value = '';
        return;
      }

      const file = event.target.files && event.target.files[0];
      if (!file) {
        return;
      }

      const formData = new FormData();
      formData.append('captions', file);

      try {
        const response = await fetch(`/api/rooms/${roomId}/captions`, {
          method: 'POST',
          headers: {
            'x-username': username,
          },
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          showToast(data.error || 'Caption upload failed.');
          return;
        }

        showToast('Captions uploaded to the room.');
      } catch (error) {
        showToast('Caption upload failed.');
      } finally {
        event.target.value = '';
      }
    });

    document.getElementById('chat-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const input = document.getElementById('chat-input');
      const text = input.value.trim();

      if (!text) {
        return;
      }

      socket.emit('chat-message', { text });
      input.value = '';
    });

    socket = window.io();
    socket.emit('join-room', { roomId, username });

    socket.on('room-error', function (payload) {
      showToast(payload.message || 'Unable to join room.');
      window.location.href = '/dashboard';
    });

    socket.on('room-state', function (room) {
      currentRoomState = room;
      renderUsers(room);
      const nextChatId = room.chat.length ? room.chat[room.chat.length - 1].id || '' : '';
      if (nextChatId !== lastRenderedChatId) {
        renderChat(room.chat);
      }
      setHostControls(isHost());
      loadVideo(room.videoState);
      updateScreenShareUI(Boolean(room.screenShare && room.screenShare.active), room.hostName);
      if (room.screenShare && room.screenShare.active && !isHost() && !viewerPeer) {
        socket.emit('request-screen-share');
      }
      document.getElementById('notification-badge').textContent = isHost() ? 'You are hosting' : 'Watching live';
    });

    socket.on('chat-message', appendMessage);
    socket.on('system-message', function (message) {
      appendMessage(message);
      showToast(message.message);
    });
    socket.on('video-changed', function (videoState) {
      if (currentRoomState) {
        currentRoomState.videoState = videoState;
      }
      loadVideo(videoState);
    });
    socket.on('video-action', function (payload) {
      updateRoomVideoState(payload.action, payload.currentTime);
      applyRemoteVideoAction(payload.action, payload.currentTime);
    });
    socket.on('screen-share-status', function (payload) {
      updateScreenShareUI(Boolean(payload.active), payload.hostName);
      if (!payload.active) {
        if (viewerPeer) {
          closePeerConnection(viewerPeer);
          viewerPeer = null;
        }
        screenSharePeers.forEach(closePeerConnection);
        screenSharePeers.clear();
        if (!isHost()) {
          resetScreenShareVideo();
        }
        return;
      }
      if (!isHost()) {
        socket.emit('request-screen-share');
      }
    });
    socket.on('screen-share-request', function (payload) {
      if (!isHost() || !localScreenStream) {
        return;
      }
      createHostPeerForViewer(payload.viewerSocketId).catch(function () {
        showToast('Unable to start screen share for a viewer.');
      });
    });
    socket.on('screen-share-offer', function (payload) {
      handleViewerOffer(payload.fromSocketId, payload.description).catch(function () {
        showToast('Unable to receive shared screen.');
      });
    });
    socket.on('screen-share-answer', async function (payload) {
      const peer = screenSharePeers.get(payload.fromSocketId);
      if (!peer) {
        return;
      }
      await peer.setRemoteDescription(payload.description);
    });
    socket.on('screen-share-ice-candidate', async function (payload) {
      if (payload.fromSocketId && screenSharePeers.has(payload.fromSocketId)) {
        const peer = screenSharePeers.get(payload.fromSocketId);
        await peer.addIceCandidate(payload.candidate);
        return;
      }

      if (viewerPeer) {
        await viewerPeer.addIceCandidate(payload.candidate);
      }
    });

    bindHtml5Events(isHost);
    bindPlaybackRecovery(isHost);

    window.addEventListener('beforeunload', function () {
      stopHostScreenShare(false);
      if (viewerPeer) {
        closePeerConnection(viewerPeer);
        viewerPeer = null;
      }
      if (socket) {
        socket.disconnect();
      }
    });
  }

  const page = document.body.dataset.page;
  if (page === 'login') {
    onLoginPage();
  }
  if (page === 'dashboard') {
    onDashboardPage();
  }
  if (page === 'room') {
    onRoomPage();
  }
})();
