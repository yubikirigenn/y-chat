const socket = io();
const roomList = document.getElementById('room-list'); const userList = document.getElementById('user-list'); const messages = document.getElementById('messages'); const form = document.getElementById('form'); const input = document.getElementById('input'); const currentRoomNameEl = document.getElementById('current-room-name'); const chatMessagesArea = document.getElementById('chat-messages-area'); const createRoomBtn = document.getElementById('create-room-btn'); const createRoomDialog = document.getElementById('create-room-dialog'); const createRoomForm = document.getElementById('create-room-form'); const joinRoomBtn = document.getElementById('join-room-btn'); const joinRoomDialog = document.getElementById('join-room-dialog'); const joinRoomForm = document.getElementById('join-room-form'); const cancelBtns = document.querySelectorAll('.cancel-btn'); const imageUploadBtn = document.getElementById('image-upload-btn'); const imageInput = document.getElementById('image-input'); const iconInput = document.getElementById('icon-input');
let userName = ''; let currentRoom = ''; let roomCredentials = {}; let lastJoinAttempt = { roomName: null, password: null }; const unreadCounts = {}; let myRoomsInfo = {};
let myIconUrl = '/uploads/icons/default.svg';

function initializeCredentials() { const savedCredentials = localStorage.getItem('roomCredentials'); if (savedCredentials) roomCredentials = JSON.parse(savedCredentials); }
function saveCredentials() { localStorage.setItem('roomCredentials', JSON.stringify(roomCredentials)); }
function initializeUserName() { const savedName = localStorage.getItem('chatUserName'); if (savedName) { userName = savedName; } else { while (!userName) { userName = prompt("あなたの名前を入力してください"); if (!userName) alert("名前は必須です。"); } localStorage.setItem('chatUserName', userName); } }

function createMessageElement(msg) {
    const item = document.createElement('li');
    item.className = `message-item ${msg.name === userName ? 'my-message' : 'other-message'}`;
    item.dataset.messageId = msg.id;
    item.dataset.senderName = msg.name;
    const isMyMessage = msg.name === userName;
    const date = new Date(msg.time);
    const timeString = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
    const deleteButtonHTML = isMyMessage ? `<button class="delete-btn" title="削除">×</button>` : '';
    let messageContentHTML;
    if (msg.text) { messageContentHTML = `<p class="message-text">${msg.text.replace(/\n/g, '<br>')}</p>`; }
    else if (msg.imageUrl) { messageContentHTML = `<a href="${msg.imageUrl}" target="_blank" rel="noopener noreferrer"><img src="${msg.imageUrl}" alt="アップロードされた画像"></a>`; }
    let readStatusText = '';
    if (isMyMessage) {
        const readers = typeof msg.read_by === 'string' ? JSON.parse(msg.read_by) : msg.read_by || [];
        const readCountWithoutSender = readers.filter(reader => reader !== msg.name).length;
        const isPrivate = myRoomsInfo[currentRoom] ? myRoomsInfo[currentRoom].isPrivate : false;
        if (isPrivate) { if (readCountWithoutSender >= 1) readStatusText = '既読'; }
        else { if (readCountWithoutSender > 0) readStatusText = `既読 ${readCountWithoutSender}`; }
    }
    const avatarUrl = msg.iconUrl || '/uploads/icons/default.svg';
    item.innerHTML = `
        <img src="${avatarUrl}" class="message-avatar">
        <div class="message-wrapper">
            <div class="sender-name">${msg.name}</div>
            <div class="message-content">
                <div class="message-bubble">${deleteButtonHTML}${messageContentHTML}</div>
                <div class="status-container"><span class="read-status">${readStatusText}</span><span class="message-time">${timeString}</span></div>
            </div>
        </div>
    `;
    return item;
}

function renderRoomList(rooms, activeRoom) {
    roomList.innerHTML = '';
    rooms.forEach(room => {
        const li = document.createElement('li');
        li.dataset.room = room.name;
        li.dataset.isprivate = room.is_private;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = room.name;
        li.appendChild(nameSpan);
        if (unreadCounts[room.name] > 0) { const badge = document.createElement('span'); badge.className = 'unread-badge'; badge.textContent = unreadCounts[room.name]; li.appendChild(badge); }
        if (room.name === activeRoom) li.classList.add('active');
        roomList.appendChild(li);
    });
}

// --- イベントリスナー ---
createRoomBtn.addEventListener('click', () => createRoomDialog.showModal());
joinRoomBtn.addEventListener('click', () => joinRoomDialog.showModal());
cancelBtns.forEach(btn => { btn.addEventListener('click', () => { createRoomDialog.close(); joinRoomDialog.close(); }); });
createRoomForm.addEventListener('submit', (e) => { e.preventDefault(); const roomName = document.getElementById('new-room-name').value.trim(); const password = document.getElementById('new-room-password').value.trim(); if (roomName && password) { socket.emit('create room', { roomName, password, creator: userName }); createRoomForm.reset(); createRoomDialog.close(); } });
joinRoomForm.addEventListener('submit', (e) => { e.preventDefault(); const roomName = document.getElementById('join-room-name').value.trim(); const password = document.getElementById('join-room-password').value.trim(); if (roomName && password) { lastJoinAttempt = { roomName, password }; socket.emit('attempt join room', { roomName, password }); joinRoomForm.reset(); joinRoomDialog.close(); } });
roomList.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) {
        const roomName = li.dataset.room;
        if (roomName === currentRoom) return;
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
userList.addEventListener('click', (e) => {
    if (e.target.id === 'my-avatar') { iconInput.click(); return; }
    if (e.target.classList.contains('edit-name-btn')) {
        const oldName = userName;
        const newName = prompt('新しい名前を入力してください:', userName);
        if (newName && newName.trim() !== '' && newName !== userName) {
            socket.emit('change username', { oldName, newName: newName.trim() });
            localStorage.setItem('chatUserName', newName.trim());
            userName = newName.trim();
        }
        return;
    }
    if (e.target.closest('li')) { const targetUserName = e.target.closest('li').dataset.username; if (targetUserName && targetUserName !== userName && confirm(`${targetUserName}さんと個人チャットを開始しますか？`)) { socket.emit('start private chat', targetUserName); } }
});
messages.addEventListener('click', (e) => { if (e.target.closest('.delete-btn')) { const li = e.target.closest('li'); if (li) { const messageId = li.dataset.messageId; if (confirm('このメッセージを削除しますか？')) { socket.emit('delete message', { roomId: currentRoom, messageId }); } } } });
form.addEventListener('submit', (e) => { e.preventDefault(); if (input.value) { if (currentRoom) { socket.emit('chat message', { name: userName, text: input.value }); input.value = ''; } else { alert('メッセージを送信するには、まずトークルームを選択してください。'); } } });
imageUploadBtn.addEventListener('click', () => { if (!currentRoom) { alert('画像をアップロードするには、まずトークルームを選択してください。'); return; } imageInput.click(); });
imageInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('image', file); try { const response = await fetch('/upload', { method: 'POST', body: formData }); const result = await response.json(); if (response.ok) { socket.emit('chat message', { name: userName, imageUrl: result.imageUrl }); } else { alert('画像のアップロードに失敗しました。'); } } catch (error) { console.error('アップロードエラー:', error); alert('画像のアップロード中にエラーが発生しました。'); } e.target.value = null; });
iconInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const formData = new FormData(); formData.append('icon', file); formData.append('userName', userName); try { const response = await fetch('/upload-icon', { method: 'POST', body: formData }); const result = await response.json(); if (response.ok) { myIconUrl = result.iconUrl; } else { alert('アイコンのアップロードに失敗しました。'); } } catch (error) { console.error('アイコンアップロードエラー:', error); } e.target.value = null; });

// --- Socket.IOイベント ---
socket.on('my info', ({ iconUrl }) => { myIconUrl = iconUrl; socket.emit('request user list'); });
socket.on('user icon changed', ({ userName: changedUserName, newIconUrl }) => {
    if (changedUserName === userName) { myIconUrl = newIconUrl; }
    socket.emit('request user list');
    const avatars = document.querySelectorAll(`.message-item[data-sender-name="${changedUserName}"] .message-avatar`);
    avatars.forEach(avatar => { avatar.src = newIconUrl; });
});
socket.on('update user list', (users) => {
    userList.innerHTML = '';
    const me = users.find(user => user.name === userName);
    const others = users.filter(user => user.name !== userName);
    if (me) {
        const myLi = document.createElement('li');
        myLi.dataset.username = me.name;
        myLi.innerHTML = `<div class="my-user-entry"><img id="my-avatar" src="${me.iconUrl}" class="user-avatar" title="アイコンを変更"><span style="flex-grow: 1;">${me.name} (自分)</span><button class="edit-name-btn">編集</button></div>`;
        userList.appendChild(myLi);
    }
    others.forEach(user => {
        const li = document.createElement('li');
        li.dataset.username = user.name;
        li.innerHTML = `<img src="${user.iconUrl}" class="user-avatar"><span>${user.name}</span>`;
        userList.appendChild(li);
    });
});
socket.on('update rooms', (rooms) => { myRoomsInfo = {}; rooms.forEach(room => { myRoomsInfo[room.name] = { isPrivate: room.is_private }; }); renderRoomList(rooms, currentRoom); });
socket.on('force refresh rooms', () => socket.emit('user connected', userName));
socket.on('join success', (data) => {
    currentRoom = data.roomName; currentRoomNameEl.textContent = currentRoom;
    messages.innerHTML = '';
    if (data.isPrivate !== undefined) { myRoomsInfo[currentRoom] = { isPrivate: data.isPrivate }; }
    const unreadMessageIds = [];
    data.history.forEach(msg => {
        const readers = typeof msg.read_by === 'string' ? JSON.parse(msg.read_by) : [];
        if (!readers.includes(userName)) { unreadMessageIds.push(msg.id); }
        messages.appendChild(createMessageElement(msg));
    });
    chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
    if (unreadMessageIds.length > 0) { socket.emit('mark as read', { roomName: currentRoom, messageIds: unreadMessageIds }); }
    if (data.roomName === lastJoinAttempt.roomName && lastJoinAttempt.password !== null) { roomCredentials[data.roomName] = lastJoinAttempt.password; saveCredentials(); }
    document.querySelectorAll('.room-list li, .user-list li').forEach(li => li.classList.remove('active'));
    document.querySelector(`.room-list li[data-room="${currentRoom}"]`)?.classList.add('active');
});
socket.on('join failure', (errorMessage) => alert(errorMessage));
socket.on('chat message', (msg) => { const messageRoom = msg.room; const messageData = msg.data; if (messageRoom === currentRoom) { messages.appendChild(createMessageElement(messageData)); socket.emit('mark as read', { roomName: currentRoom, messageIds: [messageData.id] }); } else { unreadCounts[messageRoom] = (unreadCounts[messageRoom] || 0) + 1; const li = document.querySelector(`.room-list li[data-room="${messageRoom}"]`); if (li) { let badge = li.querySelector('.unread-badge'); if (!badge) { badge = document.createElement('span'); badge.className = 'unread-badge'; li.appendChild(badge); } badge.textContent = unreadCounts[messageRoom]; } } });
socket.on('message deleted', ({ messageId }) => { const messageElement = document.querySelector(`li[data-message-id="${messageId}"]`); if (messageElement) { messageElement.remove(); } });
socket.on('update read status', ({ messageId, readers }) => {
    const messageElement = document.querySelector(`li[data-message-id="${messageId}"]`);
    if (messageElement && messageElement.classList.contains('my-message')) {
        let readStatusEl = messageElement.querySelector('.read-status');
        if (readStatusEl) {
            const readCountWithoutSender = readers.filter(reader => reader !== userName).length;
            const isPrivate = myRoomsInfo[currentRoom] ? myRoomsInfo[currentRoom].isPrivate : false;
            if (isPrivate) { if (readCountWithoutSender >= 1) readStatusEl.textContent = '既読'; }
            else { if (readCountWithoutSender > 0) { readStatusEl.textContent = `既読 ${readCountWithoutSender}`; } else { readStatusEl.textContent = ''; } }
        }
    }
});

// --- 初期化処理 ---
async function main() {
    initializeUserName();
    initializeCredentials();
    socket.emit('user connected', userName);
}
main();