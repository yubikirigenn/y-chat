const socket = io();

// HTML要素の取得
const roomList = document.getElementById('room-list');
const userList = document.getElementById('user-list');
const messages = document.getElementById('messages'); // メッセージリスト本体
const form = document.getElementById('form');
const input = document.getElementById('input');
// ... 他の要素取得は変更なし

let userName = '';
let currentRoom = '';
// ... 他の変数は変更なし

function initializeCredentials() { /* ... */ }
function saveCredentials() { /* ... */ }
function initializeUserName() { /* ... */ }

// ★ メッセージ要素を作成する関数を修正
function createMessageElement(msg) {
    const item = document.createElement('li');
    // ★ メッセージIDをデータ属性として設定
    item.dataset.messageId = msg.id;

    item.classList.add(msg.name === userName ? 'my-message' : 'other-message');
    const date = new Date(msg.time);
    const formattedTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    // ★ 自分のメッセージの場合のみ、削除ボタンを追加
    const deleteButtonHTML = msg.name === userName
        ? `<button class="delete-btn" title="削除">×</button>`
        : '';
    
    item.innerHTML = `
        <div class="message-content">
            <div class="sender-name">${msg.name}</div>
            <div class="message-bubble" style="position: relative;">
                ${deleteButtonHTML}
                <p class="message-text">${msg.text.replace(/\n/g, '<br>')}</p>
                <span class="message-time">${formattedTime}</span>
            </div>
        </div>
    `;
    return item;
}

function renderRoomList(rooms, activeRoom) { /* ...変更なし... */ }

// --- イベントリスナー ---
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
// ... 他のイベントリスナーは変更なし

// ★ メッセージリスト全体のクリックイベント（イベントデリゲーション）を追加
messages.addEventListener('click', (e) => {
    // クリックされたのが削除ボタンかチェック
    if (e.target.classList.contains('delete-btn')) {
        const li = e.target.closest('li');
        if (li) {
            const messageId = li.dataset.messageId;
            if (confirm('このメッセージを削除しますか？')) {
                socket.emit('delete message', { roomId: currentRoom, messageId });
            }
        }
    }
});

roomList.addEventListener('click', (e) => { /* ...変更なし... */ });
form.addEventListener('submit', (e) => { /* ...変更なし... */ });
userList.addEventListener('click', (e) => { /* ...変更なし... */ });

// --- Socket.IOイベント ---
socket.on('update user list', (users) => { /* ... */ });
socket.on('update rooms', (rooms) => { /* ... */ });
socket.on('join success', (data) => { /* ... */ });
socket.on('join failure', (errorMessage) => alert(errorMessage));
socket.on('chat message', (msg) => { /* ... */ });

// ★ メッセージ削除通知の受信リスナーを追加
socket.on('message deleted', ({ messageId }) => {
    const messageElement = document.querySelector(`li[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
    }
});

// --- 初期化処理 ---
initializeUserName();
initializeCredentials();
socket.emit('user connected', userName);

// --- 変更のない関数の再掲 ---
const currentRoomNameEl = document.getElementById('current-room-name'); const chatMessagesArea = document.getElementById('chat-messages-area'); const createRoomDialog = document.getElementById('create-room-dialog'); const createRoomForm = document.getElementById('create-room-form'); const joinRoomBtn = document.getElementById('join-room-btn'); const joinRoomDialog = document.getElementById('join-room-dialog'); const joinRoomForm = document.getElementById('join-room-form'); const cancelBtns = document.querySelectorAll('.cancel-btn'); let roomCredentials = {}; let lastJoinAttempt = { roomName: null, password: null }; const unreadCounts = {};
function initializeCredentials() { const savedCredentials = localStorage.getItem('roomCredentials'); if (savedCredentials) roomCredentials = JSON.parse(savedCredentials); }
function saveCredentials() { localStorage.setItem('roomCredentials', JSON.stringify(roomCredentials)); }
function initializeUserName() { const savedName = localStorage.getItem('chatUserName'); if (savedName) { userName = savedName; } else { while (!userName) { userName = prompt("あなたの名前を入力してください"); if (!userName) alert("名前は必須です。"); } localStorage.setItem('chatUserName', userName); } }
function renderRoomList(rooms, activeRoom) { roomList.innerHTML = ''; rooms.forEach(room => { const li = document.createElement('li'); li.dataset.room = room.name; li.dataset.isprivate = room.isPrivate; const nameSpan = document.createElement('span'); nameSpan.textContent = room.name; li.appendChild(nameSpan); if (unreadCounts[room.name] > 0) { const badge = document.createElement('span'); badge.className = 'unread-badge'; badge.textContent = unreadCounts[room.name]; li.appendChild(badge); } if (room.name === activeRoom) { li.classList.add('active'); } roomList.appendChild(li); }); }
cancelBtns.forEach(btn => { btn.addEventListener('click', () => { createRoomDialog.close(); joinRoomDialog.close(); }); });
createRoomForm.addEventListener('submit', (e) => { e.preventDefault(); const roomName = document.getElementById('new-room-name').value.trim(); const password = document.getElementById('new-room-password').value.trim(); if (roomName && password) { socket.emit('create room', { roomName, password, creator: userName }); createRoomForm.reset(); createRoomDialog.close(); } });
joinRoomForm.addEventListener('submit', (e) => { e.preventDefault(); const roomName = document.getElementById('join-room-name').value.trim(); const password = document.getElementById('join-room-password').value.trim(); if (roomName && password) { lastJoinAttempt = { roomName, password }; socket.emit('attempt join room', { roomName, password }); joinRoomForm.reset(); joinRoomDialog.close(); } });
userList.addEventListener('click', (e) => { if (e.target.tagName === 'LI') { const targetUserName = e.target.dataset.username; if (targetUserName) { if (confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) { socket.emit('start private chat', targetUserName); } } } });
roomList.addEventListener('click', (e) => { const li = e.target.closest('li'); if (li) { const roomName = li.dataset.room; const isPrivate = li.dataset.isprivate === 'true'; if (unreadCounts[roomName] > 0) { unreadCounts[roomName] = 0; const badge = li.querySelector('.unread-badge'); if (badge) badge.remove(); } if (isPrivate) { lastJoinAttempt = { roomName, password: null }; socket.emit('attempt join room', { roomName, password: null }); } else { let password = roomCredentials[roomName] || prompt(`'${roomName}' のパスワードを入力してください:`); if (password !== null) { lastJoinAttempt = { roomName, password }; socket.emit('attempt join room', { roomName, password }); } } } });
form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value) { if (currentRoom) { socket.emit('chat message', { name: userName, text: input.value }); input.value = ''; } else { alert('メッセージを送信するには、まずトークルームを選択してください。'); } } });
socket.on('update user list', (users) => { userList.innerHTML = ''; users.forEach(user => { if (user !== userName) { const li = document.createElement('li'); li.textContent = user; li.dataset.username = user; userList.appendChild(li); } }); });
socket.on('update rooms', (rooms) => { renderRoomList(rooms, currentRoom); });
socket.on('join success', (data) => { currentRoom = data.roomName; currentRoomNameEl.textContent = currentRoom; messages.innerHTML = ''; data.history.forEach(msg => messages.appendChild(createMessageElement(msg))); chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight; if (data.roomName === lastJoinAttempt.roomName && lastJoinAttempt.password !== null) { roomCredentials[data.roomName] = lastJoinAttempt.password; saveCredentials(); } document.querySelectorAll('.room-list li, .user-list li').forEach(li => li.classList.remove('active')); document.querySelector(`.room-list li[data-room="${currentRoom}"]`)?.classList.add('active'); });
socket.on('chat message', (msg) => { const messageRoom = msg.room; const messageData = msg.data; if (messageRoom === currentRoom) { messages.appendChild(createMessageElement(messageData)); chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight; } else { unreadCounts[messageRoom] = (unreadCounts[messageRoom] || 0) + 1; const li = document.querySelector(`.room-list li[data-room="${messageRoom}"]`); if (li) { let badge = li.querySelector('.unread-badge'); if (!badge) { badge = document.createElement('span'); badge.className = 'unread-badge'; li.appendChild(badge); } badge.textContent = unreadCounts[messageRoom]; } } });