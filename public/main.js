// public/main.js (メッセージ送信機能を修正した最終完成版)

const socket = io();

// --- DOM要素の取得 ---
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

// --- グローバル変数 ---
let userName = '';
let currentRoom = '';
let roomCredentials = {};
let lastJoinAttempt = { roomName: null, password: null };
let myIconUrl = '';
let myRoomsInfo = {};

// --- 初期化処理 ---
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

// --- メッセージ要素作成関数 ---
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

    const avatarUrl = msg.iconUrl || '/default-icon.svg';

    let readStatusHTML = '';
    if (isMyMessage) {
        const readers = msg.read_by || [];
        const readCountWithoutSender = readers.filter(r => r !== userName).length;
        const isPrivate = myRoomsInfo[currentRoom]?.isPrivate;
        if (isPrivate) {
            if (readCountWithoutSender > 0) readStatusHTML = '既読';
        } else {
            if (readCountWithoutSender > 0) readStatusHTML = `既読 ${readCountWithoutSender}`;
        }
    }

    item.innerHTML = `
        <img src="${avatarUrl}" class="message-avatar">
        <div class="message-wrapper">
            <div class="sender-name">${msg.name}</div>
            <div class="message-content">
                <div class="message-bubble">${messageContentHTML}</div>
                <div class="status-container">
                    <span class="read-status">${readStatusHTML}</span>
                    <span class="message-time">${timeString}</span>
                </div>
            </div>
        </div>
    `;
    return item;
}

// --- UI更新関数 ---
function renderRoomList(rooms) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.room = room.name;
        li.dataset.isprivate = room.is_private;
        li.textContent = room.name;
        if (room.name === currentRoom) li.classList.add('active');
        roomList.appendChild(li);
    });
}
function renderUserList(users) {
    userList.innerHTML = '';
    const me = users.find(u => u.name === userName);
    const others = users.filter(u => u.name !== userName);
    if (me) {
        const li = document.createElement('li');
        li.innerHTML = `<img src="${me.icon_url || '/default-icon.svg'}" class="user-avatar" id="my-avatar" style="cursor: pointer;" title="アイコンを変更"><span>${me.name} (自分)</span>`;
        userList.appendChild(li);
    }
    others.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `<img src="${user.icon_url || '/default-icon.svg'}" class="user-avatar"><span>${user.name}</span>`;
        userList.appendChild(li);
    });
}

// --- イベントリスナー ---
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('new-room-name').value.trim();
    const password = document.getElementById('new-room-password').value.trim();
    if (roomName) {
        socket.emit('create room', { roomName, password, creator: userName });
        createRoomForm.reset();
        createRoomDialog.close();
    }
});
roomList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li && li.dataset.room !== currentRoom) {
        const roomName = li.dataset.room;
        let password = roomCredentials[roomName];
        if (password === undefined) {
            password = prompt(`'${roomName}' のパスワードを入力してください:`);
        }
        if (password !== null) {
            lastJoinAttempt = { roomName, password };
            socket.emit('attempt join room', { roomName, password });
        }
    }
});

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★                                                  ★
// ★    ここが、今回の問題を解決する最後の修正箇所です    ★
// ★                                                  ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentRoom) {
        socket.emit('chat message', {
            room: currentRoom,
            name: userName,
            text: input.value,
            imageUrl: null // ★ この行が抜けていたのを修正しました
        });
        input.value = '';
    }
});

imageUploadBtn.addEventListener('click', () => {
    if (!currentRoom) return alert('画像をアップロードするには、まずトークルームを選択してください。');
    imageInput.click();
});
imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('/upload', { method: 'POST', body: formData });
    const result = await response.json();
    if (response.ok) {
        socket.emit('chat message', {
            room: currentRoom,
            name: userName,
            text: null,
            imageUrl: result.imageUrl
        });
    }
    e.target.value = '';
});
userList.addEventListener('click', (e) => {
    if (e.target.id === 'my-avatar') iconInput.click();
});
iconInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('icon', file);
    formData.append('userName', userName);
    await fetch('/upload-icon', { method: 'POST', body: formData });
    e.target.value = '';
});
cancelBtns.forEach(btn => btn.addEventListener('click', () => createRoomDialog.close()));

// --- Socket.IOイベントハンドラ ---
socket.on('my info', ({ iconUrl }) => { myIconUrl = iconUrl; });
socket.on('update rooms', (rooms) => {
    myRoomsInfo = {};
    if(Array.isArray(rooms)) {
        rooms.forEach(room => { myRoomsInfo[room.name] = { isPrivate: room.is_private }; });
    }
    renderRoomList(rooms || []);
});
socket.on('update user list', renderUserList);
socket.on('user icon changed', ({ userName: changedUser, newIconUrl }) => {
    if (changedUser === userName) myIconUrl = newIconUrl;
    renderUserList(Array.from(userList.children).map(li => {
        const name = li.querySelector('span').textContent.replace(' (自分)', '');
        const img = li.querySelector('img');
        return { name, icon_url: name === changedUser ? newIconUrl : img.src };
    }));
});
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
    renderRoomList(Object.keys(myRoomsInfo).map(name => ({ name, ...myRoomsInfo[name] })));
});
socket.on('join failure', (errorMessage) => {
    alert(errorMessage);
    if (lastJoinAttempt.roomName) delete roomCredentials[lastJoinAttempt.roomName];
    saveCredentials();
});
socket.on('chat message', (msg) => {
    if (msg.room === currentRoom) {
        messages.appendChild(createMessageElement(msg.data));
        chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    }
});

// --- アプリケーション開始 ---
function main() {
    initializeCredentials();
    initializeUserName();
    socket.emit('user connected', userName);
}

main();