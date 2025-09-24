// public/main.js (個人チャット機能を完全に復元した最終完成版)

const socket = io();

// (エラー表示機能は、念のため残しておきます)
socket.on('server error', ({ event, message }) => {
    console.error(`Server Error on event "${event}":`, message);
    alert(`サーバーで内部エラーが発生しました。\n\nイベント: ${event}\n詳細: ${message}\n\nこのメッセージを開発者に伝えてください。`);
});

const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
// (他のDOM要素も同様)
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

// --- 初期化関数 (変更なし) ---
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

// --- メッセージ要素作成関数 (変更なし) ---
function createMessageElement(msg) {
    const item = document.createElement('li');
    const isMyMessage = msg.name === userName;
    item.className = `message-item ${isMyMessage ? 'my-message' : 'other-message'}`;
    item.dataset.messageId = msg.id;
    const date = new Date(msg.time);
    const timeString = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    let messageContentHTML = '';
    if (msg.text) { messageContentHTML = `<p>${msg.text.replace(/\n/g, '<br>')}</p>`; }
    else if (msg.imageUrl) { messageContentHTML = `<a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${msg.imageUrl}" alt="画像"></a>`; }
    const avatarUrl = msg.iconUrl || '/default-icon.svg';
    let readStatusHTML = '';
    if (isMyMessage) {
        const readers = msg.read_by || [];
        const readCountWithoutSender = readers.filter(r => r !== userName).length;
        if (myRoomsInfo[currentRoom]?.isPrivate && readCountWithoutSender > 0) {
            readStatusHTML = '既読';
        } else if (readCountWithoutSender > 0) {
            readStatusHTML = `既読 ${readCountWithoutSender}`;
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
    users.forEach(user => {
        const li = document.createElement('li');
        // ★ クリックイベントのために、各ユーザーに data-username を付与
        li.dataset.username = user.name;
        const isMe = user.name === userName;
        li.innerHTML = `<img src="${user.icon_url || '/default-icon.svg'}" class="user-avatar" ${isMe ? 'id="my-avatar"' : ''}><span>${user.name}${isMe ? ' (自分)' : ''}</span>`;
        // ★ 自分以外のユーザーはクリックできるようにカーソルを変更
        if (!isMe) {
            li.style.cursor = 'pointer';
            li.title = `${user.name}さんと個人チャットを開始`;
        }
        userList.appendChild(li);
    });
}

// --- イベントリスナー ---
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
// (他のイベントリスナーは変更なし)
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
form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value && currentRoom) {
        socket.emit('chat message', { room: currentRoom, name: userName, text: input.value, imageUrl: null });
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
        socket.emit('chat message', { room: currentRoom, name: userName, text: null, imageUrl: result.imageUrl });
    }
    e.target.value = '';
});

// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★                                                  ★
// ★    ここが、私のミスで抜け落ちていた機能の本体です    ★
// ★                                                  ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
userList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return; // liがなければ何もしない

    // アイコン変更の処理
    if (li.querySelector('#my-avatar')) {
        iconInput.click();
        return;
    }

    // 個人チャット開始の処理
    const targetUserName = li.dataset.username;
    if (targetUserName && targetUserName !== userName) {
        if (confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) {
            socket.emit('start private chat', targetUserName);
        }
    }
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

// --- Socket.IOイベントハンドラ (変更なし) ---
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
    // ユーザーリストを再描画してアイコンを更新
    const users = Array.from(userList.children).map(li => {
        const name = li.dataset.username;
        const img = li.querySelector('img');
        return { name, icon_url: name === changedUser ? newIconUrl : img.src };
    });
    renderUserList(users);
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