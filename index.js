const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};
const chatHistory = {};
const onlineUsers = {};

function broadcastUserList() { /* ...変更なし... */ }
function sendRoomList(socket) { /* ...変更なし... */ }

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    socket.on('user connected', (userName) => { /* ...変更なし... */ });
    socket.on('create room', ({ roomName, password, creator }) => { /* ...変更なし... */ });
    socket.on('start private chat', (targetUserName) => { /* ...変更なし... */ });
    socket.on('attempt join room', ({ roomName, password }) => { /* ...変更なし... */ });

    // チャットメッセージ受信
    socket.on('chat message', (msg) => {
        // ★ メッセージに一意のIDを付与
        const messageData = {
            id: Date.now() + Math.random().toString(36).substr(2, 9), // 簡易的なユニークID
            name: msg.name,
            text: msg.text,
            time: new Date()
        };
        if (socket.currentRoom) {
            if (!chatHistory[socket.currentRoom]) {
                chatHistory[socket.currentRoom] = [];
            }
            chatHistory[socket.currentRoom].push(messageData);
            
            io.to(socket.currentRoom).emit('chat message', {
                room: socket.currentRoom,
                data: messageData
            });
        }
    });

    // ★ メッセージ削除リクエスト受信 (新規追加)
    socket.on('delete message', ({ roomId, messageId }) => {
        const userName = socket.userName;
        
        // 履歴が存在し、ルームIDが正しいかチェック
        if (chatHistory[roomId] && userName) {
            // 履歴から該当メッセージのインデックスを探す
            const messageIndex = chatHistory[roomId].findIndex(
                msg => msg.id === messageId && msg.name === userName // IDと名前が一致するか
            );

            // 本人が送信したメッセージが見つかった場合
            if (messageIndex !== -1) {
                // 履歴からメッセージを削除
                chatHistory[roomId].splice(messageIndex, 1);
                
                // ルームの全員にメッセージが削除されたことを通知
                io.to(roomId).emit('message deleted', { messageId });
                console.log(`メッセージが削除されました: ${messageId}`);
            }
        }
    });

    socket.on('disconnect', () => { /* ...変更なし... */ });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`サーバーがポート${PORT}で起動しました`));

// --- 変更のない関数の再掲 ---
function broadcastUserList() { io.emit('update user list', Object.values(onlineUsers)); }
function sendRoomList(socket) { const userName = socket.userName; if (!userName) return; const myRoomKeys = Object.keys(rooms).filter(r => rooms[r].participants.includes(userName)); const myRoomData = myRoomKeys.map(name => ({ name: name, isPrivate: rooms[name].isPrivate || false })); socket.emit('update rooms', myRoomData); }
io.on('connection', (socket) => {
    socket.on('user connected', (userName) => { onlineUsers[socket.id] = userName; socket.userName = userName; sendRoomList(socket); broadcastUserList(); });
    socket.on('create room', ({ roomName, password, creator }) => { if (!rooms[roomName]) { rooms[roomName] = { password, creator, participants: [creator], isPrivate: false }; chatHistory[roomName] = []; sendRoomList(socket); socket.emit('join success', { roomName, history: chatHistory[roomName] }); } });
    socket.on('start private chat', (targetUserName) => { const initiatorName = socket.userName; if (targetUserName === initiatorName) return; const roomName = [initiatorName, targetUserName].sort().join('-'); if (!rooms[roomName]) { rooms[roomName] = { password: null, creator: initiatorName, participants: [initiatorName, targetUserName], isPrivate: true }; chatHistory[roomName] = []; } const targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id] === targetUserName); if (targetSocketId) { const targetSocket = io.sockets.sockets.get(targetSocketId); sendRoomList(targetSocket); targetSocket.emit('join success', { roomName, history: chatHistory[roomName] }); } sendRoomList(socket); socket.emit('join success', { roomName, history: chatHistory[roomName] }); });
    socket.on('attempt join room', ({ roomName, password }) => { const userName = socket.userName; if (!rooms[roomName] || !userName) return socket.emit('join failure', '指定されたトークルームは存在しません。'); const room = rooms[roomName]; if (room.isPrivate) { if (!room.participants.includes(userName)) return; } else if (room.creator !== userName && room.password !== password) { return socket.emit('join failure', 'パスワードが間違っています。'); } if (socket.currentRoom) socket.leave(socket.currentRoom); socket.join(roomName); socket.currentRoom = roomName; if (!room.participants.includes(userName)) { room.participants.push(userName); sendRoomList(socket); } socket.emit('join success', { roomName, history: chatHistory[roomName] }); });
    socket.on('disconnect', () => { delete onlineUsers[socket.id]; broadcastUserList(); });
});