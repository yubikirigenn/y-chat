// public/main.js (既読機能と自動参加を完全に復元した最終完成版)

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

// --- メッセージ要素作成関数 ---
function createMessageElement(msg) {
    const item = document.createElement('li');
    const isMyMessage = msg.name === userName;
    item.className = `message-item ${isMyMessage ? 'my-message' : 'other-message'}`;
    item.dataset.messageId = msg.id; // ★ 既読処理のためにIDを付与
    const date = new Date(msg.time);
    const timeString = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    let messageContentHTML = '';
    if (msg.text) { messageContentHTML = `<p>${msg.text.replace(/\n/g, '<br>')}</p>`; }
    else if (msg.imageUrl) { messageContentHTML = `<a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${msg.imageUrl}" alt="画像"></a>`; }
    const avatarUrl = msg.iconUrl || '/default-icon.svg';

    // ★ 既読ステータスを計算
    let readStatusHTML = '';
    if (isMyMessage) {
        const readers = Array.isArray(msg.read_by) ? msg.read_by : [];
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
        li.dataset.username = user.name;
        const isMe = user.name === userName;
        li.innerHTML = `<img src="${user.icon_url || '/default-icon.svg'}" class="user-avatar" ${isMe ? 'id="my-avatar"' : ''}><span>${user.name}${isMe ? ' (自分)' : ''}</span>`;
        if (!isMe) {
            li.style.cursor = 'pointer';
            li.title = `${user.name}さんと個人チャットを開始`;
        }
        userList.appendChild(li);
    });
}

// --- イベントリスナー ---
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★                                                  ★
// ★    ここが、私のミスで抜け落ちていた機能の本体です    ★
// ★                                                  ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const roomName = document.getElementById('new-room-name').value.trim();
    const password = document.getElementById('new-room-password').value.trim();
    if (roomName) {
        socket.emit('create room', { roomName, password, creator: userName });
        // ★ 作成後、自動で参加する
        lastJoinAttempt = { roomName, password };
        socket.emit('attempt join room', { roomName, password });
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
userList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    if (li.querySelector('#my-avatar')) {
        iconInput.click();
        return;
    }
    const targetUserName = li.dataset.username;
    if (targetUserName && targetUserName !== userName) {
        if (confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) {
            socket.emit('start private chat', targetUserName);
        }
    }
});
// (他のイベントリスナーは変更なし)
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
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
    if (Array.isArray(rooms)) {
        rooms.forEach(room => { myRoomsInfo[room.name] = { isPrivate: room.is_private }; });
    }
    renderRoomList(rooms || []);
});
socket.on('update user list', renderUserList);
socket.on('user icon changed', ({ userName: changedUser, newIconUrl }) => {
    if (changedUser === userName) myIconUrl = newIconUrl;
    const users = Array.from(userList.querySelectorAll('li')).map(li => {
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
    
    // ★ ルームに入ったら、未読メッセージを既読にする
    const unreadMessageIds = data.history
        .filter(msg => {
            const readers = Array.isArray(msg.read_by) ? msg.read_by : [];
            return !readers.includes(userName);
        })
        .map(msg => msg.id);

    if (unreadMessageIds.length > 0) {
        socket.emit('mark as read', { roomName: currentRoom, messageIds: unreadMessageIds, userName: userName });
    }
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
        // ★ 新しいメッセージはすぐに既読にする
        socket.emit('mark as read', { roomName: currentRoom, messageIds: [msg.data.id], userName: userName });
    }
});
// ★ 既読状態が更新されたら、画面に反映する
socket.on('update read status', ({ messageId, readers }) => {
    const messageElement = document.querySelector(`li[data-message-id="${messageId}"]`);
    if (messageElement && messageElement.classList.contains('my-message')) {
        const readStatusEl = messageElement.querySelector('.read-status');
        const readCountWithoutSender = readers.filter(r => r !== userName).length;
        if (myRoomsInfo[currentRoom]?.isPrivate && readCountWithoutSender > 0) {
            readStatusEl.textContent = '既読';
        } else if (readCountWithoutSender > 0) {
            readStatusEl.textContent = `既読 ${readCountWithoutSender}`;
        }
    }
});

// --- アプリケーション開始 ---
function main() {
    initializeCredentials();
    initializeUserName();
    socket.emit('user connected', userName);
}

main();