const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session'); // Thêm thư viện session
const bcrypt = require('bcrypt'); // Thêm thư viện bcrypt

const app = express();
const PORT = process.env.PORT || 3000; // Sử dụng biến môi trường PORT cho Render

// Đáp án đúng của trò chơi (CHỈ NÊN ĐẶT Ở ĐÂY, KHÔNG ĐỂ Ở CLIENT)
const CORRECT_ANSWER = "FPTFLAG2025"; // <-- THAY ĐỔI ĐÁP ÁN ĐÚNG CỦA BẠN TẠI ĐÂY!

// Cấu hình tài khoản Admin (chỉ để demo, trong thực tế nên lưu trong DB hoặc biến môi trường an toàn hơn)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('your_admin_password', 10); // <-- THAY ĐỔI MẬT KHẨU ADMIN CỦA BẠN TẠI ĐÂY!
                                                                                                      // Đảm bảo mật khẩu mạnh và không để lộ!

// Khởi tạo cơ sở dữ liệu SQLite
const db = new sqlite3.Database('./leaderboard.db', (err) => {
    if (err) {
        console.error('Lỗi khi mở cơ sở dữ liệu:', err.message);
    } else {
        console.log('Đã kết nối tới cơ sở dữ liệu SQLite.');
        // Tạo bảng players nếu chưa tồn tại
        db.run(`CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            finish_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (createErr) => {
            if (createErr) {
                console.error('Lỗi khi tạo bảng players:', createErr.message);
            } else {
                console.log('Bảng "players" đã sẵn sàng hoặc đã được tạo.');
            }
        });
        // Tạo bảng admin_users nếu chưa tồn tại (cho admin login)
        db.run(`CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )`, (createErr) => {
            if (createErr) {
                console.error('Lỗi khi tạo bảng admin_users:', createErr.message);
            } else {
                console.log('Bảng "admin_users" đã sẵn sàng hoặc đã được tạo.');
                // Thêm tài khoản admin mặc định nếu chưa có
                db.get('SELECT COUNT(*) AS count FROM admin_users WHERE username = ?', [ADMIN_USERNAME], (err, row) => {
                    if (err) {
                        console.error('Lỗi khi kiểm tra admin_users:', err.message);
                        return;
                    }
                    if (row.count === 0) {
                        db.run('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)', [ADMIN_USERNAME, ADMIN_PASSWORD_HASH], (insertErr) => {
                            if (insertErr) {
                                console.error('Lỗi khi thêm admin user:', insertErr.message);
                            } else {
                                console.log(`Tài khoản admin '${ADMIN_USERNAME}' đã được thêm.`);
                            }
                        });
                    }
                });
            }
        });
    }
});

// Middleware để phân tích cú pháp JSON trong yêu cầu
app.use(express.json());
// Middleware để phân tích cú pháp URL-encoded data
app.use(express.urlencoded({ extended: true }));

// Cấu hình session
app.use(session({
    secret: process.env.SESSION_SECRET || 'a_very_secret_key_for_your_app', // <-- THAY ĐỔI CHUỖI NÀY! PHẢI ĐỦ MẠNH VÀ KHÔNG ĐỂ LỘ!
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 ngày
    }
}));

// Middleware để kiểm tra xác thực admin
function isAuthenticated(req, res, next) {
    if (req.session.isAdmin) {
        next(); // Cho phép request tiếp tục
    } else {
        res.status(401).send('Unauthorized'); // Từ chối nếu chưa xác thực
    }
}

// Phục vụ các file tĩnh từ thư mục 'public' (chứa index.html)
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint để gửi đáp án (vẫn công khai cho người chơi)
app.post('/submit-answer', (req, res) => {
    const { name, answer } = req.body;

    if (!name || !answer) {
        return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên và đáp án.' });
    }

    if (answer.toLowerCase() !== CORRECT_ANSWER.toLowerCase()) {
        return res.json({ success: false, message: 'Đáp án không đúng. Vui lòng thử lại.' });
    }

    db.get('SELECT id FROM players WHERE name = ?', [name], (err, row) => {
        if (err) {
            console.error('Lỗi khi truy vấn DB:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ.' });
        }

        if (row) {
            return res.json({ success: true, message: `Chúc mừng bạn đã hoàn thành! Bạn đã có mặt trong bảng xếp hạng.` });
        } else {
            db.run('INSERT INTO players (name) VALUES (?)', [name], function(insertErr) {
                if (insertErr) {
                    console.error('Lỗi khi chèn dữ liệu:', insertErr.message);
                    return res.status(500).json({ success: false, message: 'Lỗi khi lưu kết quả của bạn.' });
                }
                console.log(`Người chơi ${name} đã hoàn thành và được thêm vào DB.`);
                return res.json({ success: true, message: `Chúc mừng bạn, ${name}, đã hoàn thành trò chơi! Bạn đã có mặt trong bảng xếp hạng` });
            });
        }
    });
});

// API Endpoint cho Admin Login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Vui lòng nhập tên người dùng và mật khẩu.' });
    }

    db.get('SELECT * FROM admin_users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            console.error('Lỗi khi truy vấn admin user:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi máy chủ nội bộ.' });
        }

        if (!user) {
            return res.status(401).json({ success: false, message: 'Tên người dùng hoặc mật khẩu không đúng.' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
            req.session.isAdmin = true; // Đặt biến session để đánh dấu đã đăng nhập
            res.json({ success: true, message: 'Đăng nhập thành công!' });
        } else {
            res.status(401).json({ success: false, message: 'Tên người dùng hoặc mật khẩu không đúng.' });
        }
    });
});

// API Endpoint cho Admin Logout
app.post('/admin/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Lỗi khi đăng xuất:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi khi đăng xuất.' });
        }
        res.json({ success: true, message: 'Đăng xuất thành công.' });
    });
});

// API Endpoint để lấy bảng xếp hạng (CHỈ ADMIN MỚI XEM ĐƯỢC)
app.get('/leaderboard', isAuthenticated, (req, res) => { // Áp dụng middleware isAuthenticated
    db.all('SELECT name, finish_time FROM players ORDER BY finish_time ASC', [], (err, rows) => {
        if (err) {
            console.error('Lỗi khi lấy bảng xếp hạng:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi khi tải bảng xếp hạng.' });
        }
        res.json(rows);
    });
});

// API Endpoint để reset bảng xếp hạng (CHỈ ADMIN MỚI CÓ QUYỀN)
app.post('/admin/reset-leaderboard', isAuthenticated, (req, res) => {
    db.run('DELETE FROM players', [], function(err) {
        if (err) {
            console.error('Lỗi khi xóa bảng:', err.message);
            return res.status(500).json({ success: false, message: 'Lỗi khi reset bảng xếp hạng.' });
        }
        console.log(`Đã xóa ${this.changes} hàng từ bảng players.`);
        res.json({ success: true, message: 'Bảng xếp hạng đã được reset thành công.' });
    });
});

// Khởi động máy chủ
app.listen(PORT, () => {
    console.log(`Server đang chạy trên http://localhost:${PORT}`);
    console.log(`Truy cập trò chơi tại http://localhost:${PORT}`);
    console.log(`Admin panel tại http://localhost:${PORT}/admin.html`);
});
