// public/main.js (すべての構文エラーを修正した最終完成版)

const socket = io();

socket.on('server error', ({ event, message }) => {
    console.error(`Server Error on event "${event}":`, message);
    alert(`サーバーで内部エラーが発生しました。\n\nイベント: ${event}\n詳細: ${message}\n\nこのメッセージを開発者に伝えてください。`);
});

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
const cancelBtns = document.querySelectorAll('.cancel-btn');
const imageUploadBtn = document.getElementById('image-upload-btn');
const imageInput = document.getElementById('image-input');
const iconInput = document.getElementById('icon-input');

let userName = '';
let currentRoom = '';
let roomCredentials = {};
let lastJoinAttempt = { roomName: null, password: null };
let myIconUrl = '';
let myRoomsInfo = {};
const unreadCounts = {};

function initializeCredentials() {
    const saved = localStorage.getItem('roomCredentials');
    if (saved) roomCredentials = JSON.parse(saved);
}
function saveCredentials() {
    localStorage.setItem('roomCredentials', JSON.stringify(roomCredentials));
}
function initializeUserName() {
    let saved = localStorage.getItem('chatUserName');
    if (saved) { userName = saved; }
    else {
        while (!userName) {
            userName = prompt("あなたの名前を入力してください");
            if (!userName) alert("名前は必須です。");
        }
        localStorage.setItem('chatUserName', userName);
    }
}

function createMessageElement(msg) {
    const item = document.createElement('li');
    const isMyMessage = msg.name === userName;
    item.className = `message-item ${isMyMessage ? 'my-message' : 'other-message'}`;
    item.dataset.messageId = msg.id;

    const date = new Date(msg.time);
    const timeString = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

    let messageContentHTML = '';
    if (msg.text) {
        messageContentHTML = `<p>${msg.text.replace(/\n/g, '<br>')}</p>`;
    } else if (msg.imageUrl) {
        messageContentHTML = `<a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${msg.imageUrl}" alt="画像"></a>`;
    }

    const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const avatarUrl = msg.iconUrl || transparentPixel;
    const onErrorScript = `this.onerror=null; this.src='${transparentPixel}';`;

    let readStatusText = '';
    if (isMyMessage) {
        const readers = Array.isArray(msg.read_by) ? msg.read_by : [];
        const readCountWithoutSender = readers.filter(r => r !== userName).length;
        if (myRoomsInfo[currentRoom]?.isPrivate && readCountWithoutSender > 0) {
            readStatusText = '既読';
        } else if (readCountWithoutSender > 0) {
            readStatusText = `既読 ${readCountWithoutSender}`;
        }
    }

    item.innerHTML = `
        <img src="${avatarUrl}" class="message-avatar" onerror="${onErrorScript}">
        <div class="message-wrapper">
            <div class="sender-name">${msg.name}</div>
            <div class="message-content">
                <div class="message-bubble">${messageContentHTML}</div>
                <div class="status-container">
                    <span class="read-status">${readStatusText}</span>
                    <span class="message-time">${timeString}</span>
                </div>
            </div>
        </div>
    `;
    return item;
}

function renderRoomList(rooms) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.room = room.name;
        li.dataset.isprivate = room.is_private;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = room.name;
        li.appendChild(nameSpan);
        if (unreadCounts[room.name] > 0) {
            const badge = document.createElement('span');
            badge.className = 'unread-badge';
            badge.textContent = unreadCounts[room.name];
            li.appendChild(badge);
        }
        if (room.name === currentRoom) li.classList.add('active');
        roomList.appendChild(li);
    });
}
function renderUserList(users) {
    userList.innerHTML = '';
    const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    const onErrorScript = `this.onerror=null; this.src='${transparentPixel}';`;
    users.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.name;
        const isMe = user.name === userName;
        const avatarUrl = user.icon_url || transparentPixel;
        li.innerHTML = `<img src="${avatarUrl}" class="user-avatar" ${isMe ? 'id="my-avatar"' : ''} onerror="${onErrorScript}"><span>${user.name}${isMe ? ' (自分)' : ''}</span>`;
        if (!isMe) {
            li.style.cursor = 'pointer';
            li.title = `${user.name}さんと個人チャットを開始`;
        } else {
            const img = li.querySelector('img');
            if (img) img.style.cursor = 'pointer';
        }
        userList.appendChild(li);
    });
}

createRoomForm.addEventListener('submit', (e) => { e.preventDefault(); const roomName = document.getElementById('new-room-name').value.trim(); const password = document.getElementById('new-room-password').value.trim(); if (roomName) { socket.emit('create room', { roomName, password, creator: userName }); lastJoinAttempt = { roomName, password }; socket.emit('attempt join room', { roomName, password }); createRoomForm.reset(); createRoomDialog.close(); } });
roomList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li && li.dataset.room !== currentRoom) { const roomName = li.dataset.room; if (unreadCounts[roomName] > 0) { unreadCounts[roomName] = 0; const badge = li.querySelector('.unread-badge'); if (badge) badge.remove(); } let password = roomCredentials[roomName]; if (password === undefined) { password = prompt(`'${roomName}' のパスワードを入力してください:`); } if (password !== null) { lastJoinAttempt = { roomName, password }; socket.emit('attempt join room', { roomName, password }); } } });
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value && currentRoom) { socket.emit('chat message', { room: currentRoom, name: userName, text: input.value, imageUrl: null }); input.value = ''; } });
userList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (!li) return; if (li.querySelector('#my-avatar')) { iconInput.click(); return; } const targetUserName = li.dataset.username; if (targetUserName && targetUserName !== userName) { if (confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) { socket.emit('start private chat', targetUserName); } } });
iconInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('icon', file); formData.append('userName', userName); await fetch('/upload-icon', { method: 'POST', body: formData }); e.target.value = ''; });
cancelBtns.forEach(btn => btn.addEventListener('click', () => createRoomDialog.close()));
imageUploadBtn.addEventListener('click', () => { if (!currentRoom) return alert('画像をアップロードするには、まずトークルームを選択してください。'); imageInput.click(); });
imageInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('image', file); const response = await fetch('/upload', { method: 'POST', body: formData }); const result = await response.json(); if (response.ok) { socket.emit('chat message', { room: currentRoom, name: userName, text: null, imageUrl: result.imageUrl }); } e.target.value = ''; });

socket.on('my info', ({ iconUrl }) => { myIconUrl = iconUrl; });
socket.on('update rooms', (rooms) => { myRoomsInfo = {}; if (Array.isArray(rooms)) { rooms.forEach(room => { myRoomsInfo[room.name] = { isPrivate: room.is_private }; }); } renderRoomList(rooms || []); });
socket.on('update user list', renderUserList);
socket.on('user icon changed', ({ userName: changedUser, newIconUrl }) => { if (changedUser === userName) myIconUrl = newIconUrl; const users = Array.from(userList.querySelectorAll('li')).map(li => { const name = li.dataset.username; const img = li.querySelector('img'); return { name, icon_url: name === changedUser ? newIconUrl : img.src }; }); renderUserList(users); });
socket.on('join success', (data) => {
    currentRoom = data.roomName;
    currentRoomNameEl.textContent = currentRoom;
    messages.innerHTML = '';
    data.history.forEach(msg => messages.appendChild(createMessageElement(msg)));
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    if (lastJoinAttempt.roomName === currentRoom) {
        roomCredentials[currentRoom] = lastJoinAttempt.password;
        saveCredentials();
    }
    unreadCounts[currentRoom] = 0;
    renderRoomList(Object.keys(myRoomsInfo).map(name => ({ name, ...myRoomsInfo[name] })));
    const unreadMessageIds = data.history.filter(msg => !(Array.isArray(msg.read_by) ? msg.read_by : []).includes(userName)).map(msg => msg.id);
    if (unreadMessageIds.length > 0) {
        socket.emit('mark as read', { roomName: currentRoom, messageIds: unreadMessageIds, userName: userName });
    }
});
socket.on('join failure', (errorMessage) => { alert(errorMessage); if (lastJoinAttempt.roomName) delete roomCredentials[lastJoinAttempt.roomName]; saveCredentials(); });
socket.on('chat message', (msg) => { if (msg.room === currentRoom) { messages.appendChild(createMessageElement(msg.data)); chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight; socket.emit('mark as read', { roomName: currentRoom, messageIds: [msg.data.id], userName: userName }); } });
socket.on('update read status', ({ messageId, readers }) => { const messageElement = document.querySelector(`li[data-message-id="${messageId}"]`); if (messageElement && messageElement.classList.contains('my-message')) { const readStatusEl = messageElement.querySelector('.read-status'); const readCountWithoutSender = readers.filter(r => r !== userName).length; if (myRoomsInfo[currentRoom]?.isPrivate && readCountWithoutSender > 0) { readStatusEl.textContent = '既読'; } else if (readCountWithoutSender > 0) { readStatusEl.textContent = `既読 ${readCountWithoutSender}`; } else { readStatusEl.textContent = ''; } } });
socket.on('new unread message', ({ roomName }) => {
    unreadCounts[roomName] = (unreadCounts[roomName] || 0) + 1;
    renderRoomList(Object.keys(myRoomsInfo).map(name => ({ name, ...myRoomsInfo[name] })));
});

function main() {
    initializeCredentials();
    initializeUserName();
    socket.emit('user connected', userName);
}

main();