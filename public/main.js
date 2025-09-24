// main.js (エラー自動修復機能を搭載した最終版)

const socket = io();
const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const currentRoomNameEl = document.getElementById('current-room-name');
const chatMessagesArea = document.getElementById('chat-messages-area');
// (他のDOM要素も同様に取得)
const createRoomBtn = document.getElementById('create-room-btn');
const createRoomDialog = document.getElementById('create-room-dialog');
const createRoomForm = document.getElementById('create-room-form');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinRoomDialog = document.getElementById('join-room-dialog');
const joinRoomForm = document.getElementById('join-room-form');
const cancelBtns = document.querySelectorAll('.cancel-btn');
const imageUploadBtn = document.getElementById('image-upload-btn');
const imageInput = document.getElementById('image-input');
const iconInput = document.getElementById('icon-input');

let userName = '';
let currentRoom = '';
let roomCredentials = {};
let lastJoinAttempt = { roomName: null, password: null };
const unreadCounts = {};
let myRoomsInfo = {};
let myIconUrl = '/uploads/icons/default.svg';

function initializeCredentials() {
    const savedCredentials = localStorage.getItem('roomCredentials');
    if (savedCredentials) roomCredentials = JSON.parse(savedCredentials);
}
function saveCredentials() {
    localStorage.setItem('roomCredentials', JSON.stringify(roomCredentials));
}
function initializeUserName() {
    const savedName = localStorage.getItem('chatUserName');
    if (savedName) { userName = savedName; }
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
    item.className = `message-item ${msg.name === userName ? 'my-message' : 'other-message'}`;
    item.dataset.messageId = msg.id;
    item.dataset.senderName = msg.name;
    const isMyMessage = msg.name === userName;
    const date = new Date(msg.time);
    const timeString = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    let messageContentHTML = '';
    if (msg.text) { messageContentHTML = `<p>${msg.text.replace(/\n/g, '<br>')}</p>`; }
    else if (msg.imageUrl) { messageContentHTML = `<a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${msg.imageUrl}" alt="画像"></a>`; }
    
    const avatarUrl = msg.iconUrl || '/uploads/icons/default.svg';

    item.innerHTML = `
        <img src="${avatarUrl}" class="message-avatar">
        <div class="message-wrapper">
            <div class="sender-name">${msg.name}</div>
            <div class="message-content">
                <div class="message-bubble">${messageContentHTML}</div>
                <div class="status-container">
                    <span class="read-status"></span>
                    <span class="message-time">${timeString}</span>
                </div>
            </div>
        </div>`;
    return item;
}

function renderRoomList(rooms, activeRoom) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.room = room.name;
        li.dataset.isprivate = room.is_private;
        li.textContent = room.name;
        if (room.name === activeRoom) li.classList.add('active');
        roomList.appendChild(li);
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
    if (li) {
        const roomName = li.dataset.room;
        if (roomName === currentRoom) return;
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
        socket.emit('chat message', { room: currentRoom, name: userName, text: input.value });
        input.value = '';
    }
});
cancelBtns.forEach(btn => btn.addEventListener('click', () => {
    createRoomDialog.close();
    joinRoomDialog.close();
}));

// --- Socket.IOイベント ---
socket.on('update rooms', (rooms) => renderRoomList(rooms, currentRoom));
socket.on('update user list', (users) => {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        const isMe = user.name === userName ? ' (自分)' : '';
        li.innerHTML = `<img src="${user.icon_url}" class="user-avatar"><span>${user.name}${isMe}</span>`;
        userList.appendChild(li);
    });
});

socket.on('join success', (data) => {
    console.log("Join success!", data);
    currentRoom = data.roomName;
    currentRoomNameEl.textContent = currentRoom;
    messages.innerHTML = '';
    data.history.forEach(msg => messages.appendChild(createMessageElement(msg)));
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    if (lastJoinAttempt.roomName === currentRoom) {
        roomCredentials[currentRoom] = lastJoinAttempt.password;
        saveCredentials();
    }
    document.querySelectorAll('.room-list li').forEach(li => li.classList.remove('active'));
    document.querySelector(`.room-list li[data-room="${currentRoom}"]`)?.classList.add('active');
});

socket.on('join failure', (errorMessage) => {
    alert(errorMessage);
    if (lastJoinAttempt.roomName && roomCredentials[lastJoinAttempt.roomName]) {
        delete roomCredentials[lastJoinAttempt.roomName];
        saveCredentials();
        alert(`保存されていたパスワードが正しくないため削除しました。再度参加をお試しください。`);
    }
});

socket.on('chat message', (msg) => {
    if (msg.room === currentRoom) {
        messages.appendChild(createMessageElement(msg.data));
        chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    }
});

// --- 初期化処理 ---
function main() {
    initializeCredentials();
    initializeUserName();
    socket.emit('user connected', userName);
}

main();