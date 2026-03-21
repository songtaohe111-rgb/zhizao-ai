const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'zhizao-ai-secret-key-2024';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 文件上传配置
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

// 初始化数据库
const db = new Database.Database(path.join(__dirname, 'zhizao.db'));

// 创建数据库表
db.serialize(() => {
    // 用户表
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        company TEXT,
        role TEXT DEFAULT 'enterprise',
        avatar TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // 开发者技能表
    db.run(`CREATE TABLE IF NOT EXISTS developer_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL,
        skills TEXT,
        tools TEXT,
        bio TEXT,
        cases TEXT,
        rating REAL DEFAULT 5.0,
        orders_count INTEGER DEFAULT 0,
        level TEXT DEFAULT '新手',
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // 需求表
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT,
        description TEXT,
        budget_min INTEGER,
        budget_max INTEGER,
        deadline TEXT,
        status TEXT DEFAULT 'pending',
        attachment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    // 报价表
    db.run(`CREATE TABLE IF NOT EXISTS bids (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        developer_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        days INTEGER NOT NULL,
        proposal TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (developer_id) REFERENCES users(id)
    )`);

    // 订单表
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        developer_id TEXT NOT NULL,
        enterprise_id TEXT NOT NULL,
        price INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        milestone TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id),
        FOREIGN KEY (developer_id) REFERENCES users(id),
        FOREIGN KEY (enterprise_id) REFERENCES users(id)
    )`);

    // 评价表
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        from_user_id TEXT NOT NULL,
        to_user_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
    )`);

    console.log('数据库初始化完成');
});

// JWT认证中间件
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: '请先登录' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (err) {
        return res.status(401).json({ error: '登录已过期' });
    }
};

// ==================== 用户接口 ====================

// 注册
app.post('/api/register', async (req, res) => {
    const { phone, password, name, company, role } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = uuidv4();

        db.run(`INSERT INTO users (id, phone, password, name, company, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, phone, hashedPassword, name || '', company || '', role || 'enterprise'],
            (err) => {
                if (err) {
                    return res.status(400).json({ error: '手机号已注册' });
                }

                // 如果是开发者，创建开发者档案
                if (role === 'developer') {
                    db.run(`INSERT INTO developer_profiles (id, user_id) VALUES (?, ?)`,
                        [uuidv4(), id]);
                }

                const token = jwt.sign({ userId: id, role: role || 'enterprise' }, JWT_SECRET, { expiresIn: '7d' });
                res.json({ token, user: { id, phone, name, company, role: role || 'enterprise' } });
            });
    } catch (err) {
        res.status(500).json({ error: '注册失败' });
    }
});

// 登录
app.post('/api/login', async (req, res) => {
    const { phone, password } = req.body;
    db.get(`SELECT * FROM users WHERE phone = ?`, [phone], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: '用户不存在' });
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(400).json({ error: '密码错误' });
        }
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, phone: user.phone, name: user.name, company: user.company, role: user.role } });
    });
});

// 获取用户信息
app.get('/api/user', authenticate, (req, res) => {
    db.get(`SELECT id, phone, name, company, role FROM users WHERE id = ?`, [req.userId], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        res.json(user);
    });
});

// 更新用户资料
app.put('/api/user', authenticate, (req, res) => {
    const { name, company } = req.body;
    db.run(`UPDATE users SET name = ?, company = ? WHERE id = ?`, [name, company, req.userId], (err) => {
        if (err) return res.status(500).json({ error: '更新失败' });
        res.json({ success: true });
    });
});

// 获取开发者档案
app.get('/api/developer/profile', authenticate, (req, res) => {
    db.get(`SELECT * FROM developer_profiles WHERE user_id = ?`, [req.userId], (err, profile) => {
        if (err || !profile) {
            return res.status(404).json({ error: '档案不存在' });
        }
        profile.skills = JSON.parse(profile.skills || '[]');
        profile.tools = JSON.parse(profile.tools || '[]');
        profile.cases = JSON.parse(profile.cases || '[]');
        res.json(profile);
    });
});

// 更新开发者档案
app.put('/api/developer/profile', authenticate, (req, res) => {
    const { skills, tools, bio, cases } = req.body;
    db.run(`UPDATE developer_profiles SET skills = ?, tools = ?, bio = ?, cases = ? WHERE user_id = ?`,
        [JSON.stringify(skills), JSON.stringify(tools), bio, JSON.stringify(cases), req.userId],
        (err) => {
            if (err) return res.status(500).json({ error: '更新失败' });
            res.json({ success: true });
        });
});

// ==================== 需求接口 ====================

// 发布需求
app.post('/api/tasks', authenticate, upload.array('attachments'), (req, res) => {
    const { title, category, description, budget_min, budget_max, deadline } = req.body;
    const id = uuidv4();
    const attachments = req.files ? req.files.map(f => f.filename).join(',') : '';

    db.run(`INSERT INTO tasks (id, user_id, title, category, description, budget_min, budget_max, deadline, attachment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.userId, title, category, description, budget_min, budget_max, deadline, attachments],
        (err) => {
            if (err) return res.status(500).json({ error: '发布失败' });
            res.json({ id, success: true });
        });
});

// 获取需求列表
app.get('/api/tasks', (req, res) => {
    const { category, status, page = 1, limit = 20 } = req.query;
    let sql = `SELECT t.*, u.name as enterprise_name, u.company as enterprise_company
               FROM tasks t JOIN users u ON t.user_id = u.id WHERE 1=1`;
    const params = [];

    if (category) {
        sql += ` AND t.category = ?`;
        params.push(category);
    }
    if (status && status !== 'all') {
        sql += ` AND t.status = ?`;
        params.push(status);
    }
    // 默认显示所有状态的需求

    sql += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    db.all(sql, params, (err, tasks) => {
        if (err) return res.status(500).json({ error: '获取失败' });

        // 获取每个需求的报价数量
        tasks.forEach(task => {
            db.get(`SELECT COUNT(*) as count FROM bids WHERE task_id = ?`, [task.id], (err, result) => {
                task.bids_count = result?.count || 0;
            });
        });

        setTimeout(() => res.json(tasks), 100);
    });
});

// 获取单个需求详情
app.get('/api/tasks/:id', authenticate, (req, res) => {
    db.get(`SELECT t.*, u.name as enterprise_name, u.company as enterprise_company
            FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.id = ?`, [req.params.id], (err, task) => {
        if (err || !task) {
            return res.status(404).json({ error: '需求不存在' });
        }
        // 获取报价
        db.all(`SELECT b.*, u.name as developer_name FROM bids b
                JOIN users u ON b.developer_id = u.id WHERE b.task_id = ?`, [task.id], (err, bids) => {
            task.bids = bids || [];
            res.json(task);
        });
    });
});

// 我的需求（企业端）
app.get('/api/my/tasks', authenticate, (req, res) => {
    db.all(`SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC`, [req.userId], (err, tasks) => {
        if (err) return res.status(500).json({ error: '获取失败' });

        // 获取每个需求的订单数
        tasks.forEach(task => {
            db.get(`SELECT COUNT(*) as count FROM orders WHERE task_id = ?`, [task.id], (err, result) => {
                task.orders_count = result?.count || 0;
            });
        });

        setTimeout(() => res.json(tasks), 100);
    });
});

// ==================== 报价接口 ====================

// 提交报价
app.post('/api/bids', authenticate, (req, res) => {
    const { task_id, price, days, proposal } = req.body;
    const id = uuidv4();

    db.run(`INSERT INTO bids (id, task_id, developer_id, price, days, proposal)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [id, task_id, req.userId, price, days, proposal],
        (err) => {
            if (err) return res.status(500).json({ error: '报价失败' });
            res.json({ id, success: true });
        });
});

// 我的报价（开发者端）
app.get('/api/my/bids', authenticate, (req, res) => {
    db.all(`SELECT b.*, t.title as task_title, t.category, t.budget_min, t.budget_max
            FROM bids b JOIN tasks t ON b.task_id = t.id
            WHERE b.developer_id = ? ORDER BY b.created_at DESC`, [req.userId], (err, bids) => {
        if (err) return res.status(500).json({ error: '获取失败' });
        res.json(bids);
    });
});

// ==================== 订单接口 ====================

// 创建订单（选择开发者后）
app.post('/api/orders', authenticate, (req, res) => {
    const { task_id, developer_id, price } = req.body;
    const id = uuidv4();

    db.run(`INSERT INTO orders (id, task_id, developer_id, enterprise_id, price)
            VALUES (?, ?, ?, ?, ?)`,
        [id, task_id, developer_id, req.userId, price],
        (err) => {
            if (err) return res.status(500).json({ error: '创建订单失败' });
            // 更新需求状态
            db.run(`UPDATE tasks SET status = 'processing' WHERE id = ?`, [task_id]);
            res.json({ id, success: true });
        });
});

// 我的订单
app.get('/api/my/orders', authenticate, (req, res) => {
    const role = req.userRole;
    let sql, params;

    if (role === 'enterprise') {
        sql = `SELECT o.*, t.title as task_title, t.category, t.description as task_desc,
                      u.name as developer_name
               FROM orders o JOIN tasks t ON o.task_id = t.id
               JOIN users u ON o.developer_id = u.id
               WHERE o.enterprise_id = ? ORDER BY o.created_at DESC`;
        params = [req.userId];
    } else {
        sql = `SELECT o.*, t.title as task_title, t.category, t.description as task_desc,
                      u.name as enterprise_name, u.company as enterprise_company
               FROM orders o JOIN tasks t ON o.task_id = t.id
               JOIN users u ON o.enterprise_id = u.id
               WHERE o.developer_id = ? ORDER BY o.created_at DESC`;
        params = [req.userId];
    }

    db.all(sql, params, (err, orders) => {
        if (err) return res.status(500).json({ error: '获取失败' });
        res.json(orders);
    });
});

// 更新订单进度
app.put('/api/orders/:id/progress', authenticate, (req, res) => {
    const { progress, milestone } = req.body;
    db.run(`UPDATE orders SET progress = ?, milestone = ? WHERE id = ?`,
        [progress, milestone, req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: '更新失败' });
            res.json({ success: true });
        });
});

// 确认验收订单
app.put('/api/orders/:id/complete', authenticate, (req, res) => {
    db.run(`UPDATE orders SET status = 'done', progress = 100 WHERE id = ?`,
        [req.params.id],
        (err) => {
            if (err) return res.status(500).json({ error: '操作失败' });
            // 更新开发者订单数
            db.get(`SELECT developer_id FROM orders WHERE id = ?`, [req.params.id], (err, order) => {
                if (order) {
                    db.run(`UPDATE developer_profiles SET orders_count = orders_count + 1 WHERE user_id = ?`,
                        [order.developer_id]);
                }
            });
            res.json({ success: true });
        });
});

// ==================== 统计接口 ====================

// 平台统计
app.get('/api/stats', (req, res) => {
    db.get(`SELECT
        (SELECT COUNT(*) FROM users WHERE role = 'developer') as developers,
        (SELECT COUNT(*) FROM users WHERE role = 'enterprise') as enterprises,
        (SELECT COUNT(*) FROM orders WHERE status = 'done') as completed_orders,
        (SELECT COUNT(*) FROM tasks) as total_tasks`, (err, stats) => {
        if (err) return res.status(500).json({ error: '获取失败' });
        res.json(stats);
    });
});

// 开发者排行榜
app.get('/api/developers/ranking', (req, res) => {
    db.all(`SELECT u.name, dp.rating, dp.orders_count, dp.level
            FROM developer_profiles dp JOIN users u ON dp.user_id = u.id
            ORDER BY dp.orders_count DESC LIMIT 10`, (err, list) => {
        if (err) return res.status(500).json({ error: '获取失败' });
        res.json(list);
    });
});

// serve static files
app.use(express.static(path.join(__dirname, '..')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`智造AI平台服务已启动: http://localhost:${PORT}`);
});
