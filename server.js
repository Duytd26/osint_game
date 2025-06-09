const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000; // Cổng bạn muốn máy chủ chạy

// Đáp án đúng của trò chơi (CHỈ NÊN ĐẶT Ở ĐÂY, KHÔNG ĐỂ Ở CLIENT)
const CORRECT_ANSWER = "FPTFLAG2025"; // <-- THAY ĐỔI ĐÁP ÁN ĐÚNG CỦA BẠN TẠI ĐÂY!

// Khởi tạo cơ sở dữ liệu SQLite
const db = new sqlite3.Database('./leaderboard.db', (err) => {
    if (err) {
        console.error('Lỗi khi mở cơ sở dữ liệu:', err.message);
    } else {
        console.log('Đã kết nối tới cơ sở dữ liệu SQLite.');
        // Tạo bảng nếu chưa tồn tại
        db.run(`CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE, -- Đảm bảo tên người chơi là duy nhất
            finish_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (createErr) => {
            if (createErr) {
                console.error('Lỗi khi tạo bảng:', createErr.message);
            } else {
                console.log('Bảng "players" đã sẵn sàng hoặc đã được tạo.');
            }
        });
    }
});

// Middleware để phân tích cú pháp JSON trong yêu cầu
app.use(express.json());

// Phục vụ các file tĩnh từ thư mục 'public' (chứa index.html)
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint để gửi đáp án
app.post('/submit-answer', (req, res) => {
    const { name, answer } = req.body;

    if (!name || !answer) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên và đáp án.' });
    }

    // Kiểm tra đáp án
    if (answer.toLowerCase() !== CORRECT_ANSWER.toLowerCase()) {
        return res.json({ success: false, message: 'Đáp án không đúng. Vui lòng thử lại.' });
    }

    // Kiểm tra xem tên người chơi đã có trong bảng xếp hạng chưa
    db.get('SELECT id FROM players WHERE name = ?', [name], (err, row) => {
        if (err) {
            console.error('Lỗi khi truy vấn DB:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ.' });
        }

        if (row) {
            // Người chơi đã hoàn thành trước đó
            return res.json({ success: true, message: `Chúc mừng bạn đã hoàn thành! Bạn đã có mặt trong bảng xếp hạng.` });
        } else {
            // Người chơi hoàn thành lần đầu tiên, thêm vào bảng xếp hạng
            db.run('INSERT INTO players (name) VALUES (?)', [name], function(insertErr) {
                if (insertErr) {
                    console.error('Lỗi khi chèn dữ liệu:', insertErr.message);
                    return res.status(500).json({ success: false, message: 'Lỗi khi lưu kết quả của bạn.' });
                }
                console.log(`Người chơi ${name} đã hoàn thành và được thêm vào DB.`);
                return res.json({ success: true, message: `Chúc mừng bạn, ${name}, đã hoàn thành trò chơi!` });
            });
        }
    });
});

// API Endpoint để lấy bảng xếp hạng
app.get('/leaderboard', (req, res) => {
    // Sắp xếp theo finish_time (thời gian hoàn thành) tăng dần để tìm người đầu tiên
    db.all('SELECT name, finish_time FROM players ORDER BY finish_time ASC', [], (err, rows) => {
        if (err) {
            console.error('Lỗi khi lấy bảng xếp hạng:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi khi tải bảng xếp hạng.' });
        }
        res.json(rows);
    });
});

// Khởi động máy chủ
app.listen(PORT, () => {
    console.log(`Server đang chạy trên http://localhost:${PORT}`);
    console.log(`Truy cập trò chơi tại http://localhost:${PORT}`);
});
