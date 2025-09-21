const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

// データ構造
// rooms: { roomName: { password: 'pass', creator: 'userName', participants: ['user1', 'user2'], isPrivate: boolean } }
const rooms = {};
// chatHistory: { roomName: [ {msg1}, {msg2} ] }
const chatHistory = {};
// onlineUsers: { socketId: 'userName' }
const onlineUsers = {};


// --- ヘルパー関数 ---

// 全クライアントに現在のオンラインユーザーリストを配信する関数
function broadcastUserList() {
    io.emit('update user list', Object.values(onlineUsers));
}

// 特定のソケット（ユーザー）に、その人が参加しているルームリストを送信する関数
function sendRoomList(socket) {
    const userName = socket.userName;
    if (!userName) return;

    // 自分が参加しているルームのキーを取得
    const myRoomKeys = Object.keys(rooms).filter(r => rooms[r].participants.includes(userName));
    
    // ルーム情報を整形して送信 { name: 'ルーム名', isPrivate: true/false }
    const myRoomData = myRoomKeys.map(name => ({
        name: name,
        isPrivate: rooms[name].isPrivate || false
    }));
    socket.emit('update rooms', myRoomData);
}


// --- Socket.IO接続時の処理 ---

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    // ユーザー名を受け取り、各種初期情報を送信する
    socket.on('user connected', (userName) => {
        onlineUsers[socket.id] = userName;
        socket.userName = userName;
        sendRoomList(socket);
        broadcastUserList();
    });

    // グループチャットルーム作成リクエスト
    socket.on('create room', ({ roomName, password, creator }) => {
        if (!rooms[roomName]) {
            rooms[roomName] = { password, creator, participants: [creator], isPrivate: false };
            chatHistory[roomName] = [];
            sendRoomList(socket);
            socket.emit('join success', { roomName, history: chatHistory[roomName] });
            console.log(`新しいグループチャットが作成されました: '${roomName}'`);
        }
    });

    // 個人チャット開始リクエスト
    socket.on('start private chat', (targetUserName) => {
        const initiatorName = socket.userName;
        if (targetUserName === initiatorName) return;

        const roomName = [initiatorName, targetUserName].sort().join('-');
        
        if (!rooms[roomName]) {
            rooms[roomName] = {
                password: null,
                creator: initiatorName,
                participants: [initiatorName, targetUserName],
                isPrivate: true
            };
            chatHistory[roomName] = [];
            console.log(`新しい個人チャットが作成されました: ${roomName}`);
        }

        const targetSocketId = Object.keys(onlineUsers).find(id => onlineUsers[id] === targetUserName);
        if (targetSocketId) {
            const targetSocket = io.sockets.sockets.get(targetSocketId);
            sendRoomList(targetSocket);
            targetSocket.emit('join success', { roomName, history: chatHistory[roomName] });
        }
        
        sendRoomList(socket);
        socket.emit('join success', { roomName, history: chatHistory[roomName] });
    });

    // ルームへの入室試行リクエスト
    socket.on('attempt join room', ({ roomName, password }) => {
        const userName = socket.userName;
        if (!rooms[roomName] || !userName) return socket.emit('join failure', '指定されたトークルームは存在しません。');
        
        const room = rooms[roomName];
        if (room.isPrivate) {
            if (!room.participants.includes(userName)) return;
        } else if (room.creator !== userName && room.password !== password) {
            return socket.emit('join failure', 'パスワードが間違っています。');
        }

        if (socket.currentRoom) socket.leave(socket.currentRoom);
        socket.join(roomName);
        socket.currentRoom = roomName;

        if (!room.participants.includes(userName)) {
            room.participants.push(userName);
            sendRoomList(socket);
        }
        socket.emit('join success', { roomName, history: chatHistory[roomName] });
        console.log(`${userName} が '${roomName}' に参加成功`);
    });

    // ★★★ ここが修正された重要な箇所です ★★★
    // チャットメッセージ受信
    socket.on('chat message', (msg) => {
        const messageData = { name: msg.name, text: msg.text, time: new Date() };
        if (socket.currentRoom) {
            if (!chatHistory[socket.currentRoom]) {
                chatHistory[socket.currentRoom] = [];
            }
            chatHistory[socket.currentRoom].push(messageData);
            
            // ★ メッセージデータにルーム名を付与して送信
            io.to(socket.currentRoom).emit('chat message', {
                room: socket.currentRoom,
                data: messageData
            });
        }
    });

    // 接続切断
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
        delete onlineUsers[socket.id];
        broadcastUserList();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`サーバーがポート${PORT}で起動しました`));