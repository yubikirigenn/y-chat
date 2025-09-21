const socket = io();

// HTML要素の取得
const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const currentRoomNameEl = document.getElementById('current-room-name');
const chatMessagesArea = document.getElementById('chat-messages-area');
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomDialog = document.getElementById('create-room-dialog');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinRoomDialog = document.getElementById('join-room-dialog');
const joinRoomForm = document.getElementById('join-room-form');
const cancelBtns = document.querySelectorAll('.cancel-btn');

let userName = '';
let currentRoom = '';
let roomCredentials = {};
let lastJoinAttempt = { roomName: null, password: null };
const unreadCounts = {};

function initializeCredentials() { const savedCredentials = localStorage.getItem('roomCredentials'); if (savedCredentials) roomCredentials = JSON.parse(savedCredentials); }
function saveCredentials() { localStorage.setItem('roomCredentials', JSON.stringify(roomCredentials)); }
function initializeUserName() { const savedName = localStorage.getItem('chatUserName'); if (savedName) { userName = savedName; } else { while (!userName) { userName = prompt("あなたの名前を入力してください"); if (!userName) alert("名前は必須です。"); } localStorage.setItem('chatUserName', userName); } }
function createMessageElement(msg) { const item = document.createElement('li'); item.classList.add(msg.name === userName ? 'my-message' : 'other-message'); const date = new Date(msg.time); const formattedTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; item.innerHTML = `<div class="message-content"><div class="sender-name">${msg.name}</div><div class="message-bubble"><p class="message-text">${msg.text.replace(/\n/g, '<br>')}</p><span class="message-time">${formattedTime}</span></div></div>`; return item; }

function renderRoomList(rooms, activeRoom) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.room = room.name;
        li.dataset.isprivate = room.isPrivate;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = room.name;
        li.appendChild(nameSpan);
        if (unreadCounts[room.name] > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = unreadCounts[room.name];
            li.appendChild(badge);
        }
        if (room.name === activeRoom) {
            li.classList.add('active');
        }
        roomList.appendChild(li);
    });
}

// --- イベントリスナー ---
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
joinRoomBtn.addEventListener('click', () => joinRoomDialog.showModal());
cancelBtns.forEach(btn => { btn.addEventListener('click', () => { createRoomDialog.close(); joinRoomDialog.close(); }); });

// ★★★ ここが修正された重要な箇所です ★★★
createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('new-room-name').value.trim();
    // ★ BUG FIX: IDを 'new-room-password' に修正
    const password = document.getElementById('new-room-password').value.trim();
    
    if (roomName && password) {
        socket.emit('create room', { roomName, password, creator: userName });
        createRoomForm.reset();
        createRoomDialog.close();
    }
});

joinRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('join-room-name').value.trim();
    const password = document.getElementById('join-room-password').value.trim();
    if (roomName && password) {
        lastJoinAttempt = { roomName, password };
        socket.emit('attempt join room', { roomName, password });
        joinRoomForm.reset();
        joinRoomDialog.close();
    }
});

userList.addEventListener('click', (e) => {
    if (e.target && e.target.tagName === 'LI') {
        const targetUserName = e.target.dataset.username;
        if (targetUserName) {
            if (confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) {
                socket.emit('start private chat', targetUserName);
            }
        }
    }
});

roomList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        const roomName = li.dataset.room;
        const isPrivate = li.dataset.isprivate === 'true';
        if (unreadCounts[roomName] > 0) {
            unreadCounts[roomName] = 0;
            const badge = li.querySelector('.unread-badge');
            if (badge) badge.remove();
        }
        if (isPrivate) {
            lastJoinAttempt = { roomName, password: null };
            socket.emit('attempt join room', { roomName, password: null });
        } else {
            let password = roomCredentials[roomName] || prompt(`'${roomName}' のパスワードを入力してください:`);
            if (password !== null) {
                lastJoinAttempt = { roomName, password };
                socket.emit('attempt join room', { roomName, password });
            }
        }
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    // 入力欄に値があるかまずチェック
    if (input.value) {
        // 次に、ルームが選択されているかチェック
        if (currentRoom) {
            // 両方OKならメッセージを送信
            socket.emit('chat message', { name: userName, text: input.value });
            input.value = '';
        } else {
            // ルームが選択されていない場合はアラートを表示
            alert('メッセージを送信するには、まずトークルームを選択してください。');
        }
    }
    // 入力欄が空の場合は何もしない
});

// --- Socket.IOイベント ---
socket.on('update user list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        if (user !== userName) {
            const li = document.createElement('li');
            li.textContent = user;
            li.dataset.username = user;
            userList.appendChild(li);
        }
    });
});
socket.on('update rooms', (rooms) => { renderRoomList(rooms, currentRoom); });
socket.on('join success', (data) => {
    currentRoom = data.roomName;
    currentRoomNameEl.textContent = currentRoom;
    messages.innerHTML = '';
    data.history.forEach(msg => messages.appendChild(createMessageElement(msg)));
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    if (data.roomName === lastJoinAttempt.roomName && lastJoinAttempt.password !== null) {
        roomCredentials[data.roomName] = lastJoinAttempt.password;
        saveCredentials();
    }
    document.querySelectorAll('.room-list li, .user-list li').forEach(li => li.classList.remove('active'));
    document.querySelector(`.room-list li[data-room="${currentRoom}"]`)?.classList.add('active');
});
socket.on('join failure', (errorMessage) => alert(errorMessage));
socket.on('chat message', (msg) => {
    const messageRoom = msg.room;
    const messageData = msg.data;
    if (messageRoom === currentRoom) {
        messages.appendChild(createMessageElement(messageData));
        chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    } else {
        unreadCounts[messageRoom] = (unreadCounts[messageRoom] || 0) + 1;
        const li = document.querySelector(`.room-list li[data-room="${messageRoom}"]`);
        if (li) {
            let badge = li.querySelector('.unread-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'unread-badge';
                li.appendChild(badge);
            }
            badge.textContent = unreadCounts[messageRoom];
        }
    }
});

// --- 初期化処理 ---
initializeUserName();
initializeCredentials();
socket.emit('user connected', userName);