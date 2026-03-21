const API_BASE = '/api';
let currentUser = null;
let currentCategory = '';
let currentOrderStatus = '';
let currentTaskId = null;

// 检查登录状态
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (token && user) {
        currentUser = JSON.parse(user);
        updateUserArea();
        return true;
    }
    return false;
}

function checkAuthAndShow(page) {
    if (!checkAuth()) {
        showPage('login');
        return false;
    }
    showPage(page);
    return true;
}

// 更新用户区域
function updateUserArea() {
    const area = document.getElementById('user-area');
    if (currentUser) {
        area.innerHTML = '<span style="color: white;">' + (currentUser.name || currentUser.phone) + '</span><button class="btn btn-outline" onclick="logout()">退出</button>';
    } else {
        area.innerHTML = '<button class="btn btn-outline" onclick="showPage(\'login\')">登录</button><button class="btn btn-primary" onclick="showPage(\'register\')">注册</button>';
    }
}

// 页面切换
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('page-' + pageId).classList.add('active');

    document.querySelectorAll('.nav a').forEach(function(a) { a.classList.remove('active'); });
    var navMap = { 'home': 'nav-home', 'tasks': 'nav-tasks', 'orders': 'nav-orders', 'profile': 'nav-profile' };
    if (navMap[pageId]) document.getElementById(navMap[pageId]).classList.add('active');

    if (pageId === 'home') loadStats();
    if (pageId === 'tasks') loadTasks();
    if (pageId === 'orders') loadOrders();
    if (pageId === 'profile') loadProfile();
}

// 标签页切换
document.querySelectorAll('.tabs').forEach(function(tabContainer) {
    tabContainer.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            tabContainer.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            this.classList.add('active');
            if (tabContainer.id === 'task-tabs') {
                currentCategory = this.getAttribute('data-category');
                loadTasks();
            } else if (tabContainer.id === 'order-tabs') {
                currentOrderStatus = this.getAttribute('data-status');
                loadOrders();
            }
        });
    });
});

// 加载统计数据
async function loadStats() {
    try {
        var res = await fetch(API_BASE + '/stats');
        var data = await res.json();
        document.getElementById('stat-developers').textContent = data.developers || 0;
        document.getElementById('stat-enterprises').textContent = data.enterprises || 0;
        document.getElementById('stat-orders').textContent = data.completed_orders || 0;
        document.getElementById('stat-tasks').textContent = data.total_tasks || 0;
    } catch (e) {
        console.log('加载统计失败', e);
    }
}

// 加载需求列表
async function loadTasks() {
    var container = document.getElementById('task-list');
    try {
        var url = currentCategory ? API_BASE + '/tasks?category=' + currentCategory : API_BASE + '/tasks';
        var res = await fetch(url);
        var tasks = await res.json();

        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty">暂无需求</div>';
            return;
        }

        var html = '';
        tasks.forEach(function(task) {
            var date = new Date(task.created_at).toLocaleDateString();
            html += '<div class="task-card" onclick="showTaskDetail(\'' + task.id + '\')">' +
                '<div class="task-info">' +
                '<div class="task-title">' + task.title + '</div>' +
                '<div class="task-tags"><span class="task-tag type">' + (task.category || '未分类') + '</span></div>' +
                '<div class="task-meta">发布时间：' + date + ' | 已报价：' + (task.bids_count || 0) + '人</div>' +
                '</div>' +
                '<div class="task-price">' +
                '<div class="amount">¥' + (task.budget_min || 0) + '-' + (task.budget_max || 0) + '</div>' +
                '<div class="label">预算范围</div></div></div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty">加载失败，请稍后重试</div>';
    }
}

// 显示需求详情
async function showTaskDetail(taskId) {
    currentTaskId = taskId;
    var token = localStorage.getItem('token');
    try {
        var res = await fetch(API_BASE + '/tasks/' + taskId, {
            headers: token ? { Authorization: 'Bearer ' + token } : {}
        });
        var task = await res.json();

        var bidsHtml = '';
        if (task.bids && task.bids.length > 0) {
            bidsHtml = '<div style="margin-top: 20px;"><strong>报价列表：</strong></div>';
            task.bids.forEach(function(bid) {
                var buttonHtml = '';
                if (currentUser && currentUser.role === 'enterprise' && task.user_id === currentUser.id) {
                    buttonHtml = '<button class="btn btn-blue" style="margin-top: 10px;" onclick="createOrder(\'' + task.id + '\', \'' + bid.developer_id + '\', ' + bid.price + ')">选择此开发者</button>';
                }
                bidsHtml += '<div class="bid-item">' +
                    '<div class="bid-header"><span class="bid-developer">' + bid.developer_name + '</span><span class="bid-price">¥' + bid.price + '</span></div>' +
                    '<div style="font-size: 12px; color: #666;">工期：' + bid.days + '天</div>' +
                    '<div style="font-size: 12px; color: #666; margin-top: 8px;">' + (bid.proposal || '') + '</div>' +
                    buttonHtml + '</div>';
            });
        } else {
            bidsHtml = '<div style="margin-top: 20px; color: #999;">暂无报价</div>';
        }

        document.getElementById('task-detail-content').innerHTML =
            '<div style="margin-bottom: 20px;"><strong>需求标题：</strong>' + task.title + '</div>' +
            '<div style="margin-bottom: 10px;"><strong>分类：</strong>' + (task.category || '-') + '</div>' +
            '<div style="margin-bottom: 10px;"><strong>预算：</strong>¥' + (task.budget_min || 0) + ' - ¥' + (task.budget_max || 0) + '</div>' +
            '<div style="margin-bottom: 10px;"><strong>截止时间：</strong>' + (task.deadline || '待定') + '</div>' +
            '<div style="margin-bottom: 20px;"><strong>需求描述：</strong><br>' + (task.description || '-') + '</div>' + bidsHtml;

        // 如果是开发者，显示报价表单
        var bidFormContainer = document.getElementById('bid-form-container');
        if (currentUser && currentUser.role === 'developer') {
            bidFormContainer.innerHTML = '<h4 style="margin-bottom: 15px;">提交报价</h4>' +
                '<div class="form-group"><label>报价金额</label><input type="number" id="bid-price" class="form-control" placeholder="请输入报价金额"></div>' +
                '<div class="form-group"><label>预计工期（天）</label><input type="number" id="bid-days" class="form-control" placeholder="请输入预计工期"></div>' +
                '<div class="form-group"><label>解决方案</label><textarea id="bid-proposal" class="form-control" placeholder="请简述您的解决方案"></textarea></div>' +
                '<button class="btn btn-blue" onclick="submitBid(\'' + task.id + '\')">提交报价</button>';
        } else {
            bidFormContainer.innerHTML = '';
        }

        document.getElementById('task-detail-modal').classList.add('active');
    } catch (e) {
        alert('加载失败');
    }
}

function closeModal() {
    document.getElementById('task-detail-modal').classList.remove('active');
}

// 提交报价
async function submitBid(taskId) {
    var price = document.getElementById('bid-price').value;
    var days = document.getElementById('bid-days').value;
    var proposal = document.getElementById('bid-proposal').value;

    if (!price || !days) {
        alert('请填写报价和工期');
        return;
    }

    var token = localStorage.getItem('token');
    var res = await fetch(API_BASE + '/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ task_id: taskId, price: price, days: days, proposal: proposal })
    });

    if (res.ok) {
        alert('报价提交成功');
        closeModal();
        showTaskDetail(taskId);
    } else {
        alert('报价失败');
    }
}

// 创建订单
async function createOrder(taskId, bidId, price) {
    if (!confirm('确认选择此开发者？')) return;

    var token = localStorage.getItem('token');
    var res = await fetch(API_BASE + '/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ task_id: taskId, developer_id: bidId, price: price })
    });

    if (res.ok) {
        alert('订单创建成功');
        closeModal();
        showPage('orders');
    } else {
        alert('创建失败');
    }
}

// 加载订单
async function loadOrders() {
    var container = document.getElementById('order-list');
    if (!checkAuth()) {
        container.innerHTML = '<div class="empty">请先登录</div>';
        return;
    }

    try {
        var token = localStorage.getItem('token');
        var res = await fetch(API_BASE + '/my/orders', {
            headers: { Authorization: 'Bearer ' + token }
        });
        var orders = await res.json();

        if (currentOrderStatus) {
            orders = orders.filter(function(o) { return o.status === currentOrderStatus; });
        }

        if (orders.length === 0) {
            container.innerHTML = '<div class="empty">暂无订单</div>';
            return;
        }

        var statusMap = { 'pending': '待确认', 'processing': '进行中', 'done': '已完成' };
        var html = '';
        orders.forEach(function(order) {
            var buttonHtml = '';
            if (currentUser.role === 'enterprise' && order.status === 'processing') {
                buttonHtml = '<button class="btn btn-green" style="margin-top: 10px;" onclick="completeOrder(\'' + order.id + '\')">确认验收</button>';
            }
            html += '<div class="order-card">' +
                '<div class="order-header">' +
                '<span class="order-no">订单号：' + order.id.slice(0, 8).toUpperCase() + '</span>' +
                '<span class="order-status ' + order.status + '">' + (statusMap[order.status] || order.status) + '</span>' +
                '</div>' +
                '<div class="order-body">' +
                '<div class="order-info">' +
                '<div class="order-title">' + order.task_title + '</div>' +
                '<div class="order-desc">' + (order.task_desc || '') + '</div>' +
                '<div class="order-progress"><div class="order-progress-bar" style="width: ' + (order.progress || 0) + '%"></div></div>' +
                '<div class="order-progress-text">' + (order.milestone || '待开始') + ' - ' + new Date(order.created_at).toLocaleDateString() + '</div>' +
                '</div>' +
                '<div style="text-align: right;">' +
                '<div style="font-size: 20px; font-weight: bold; color: #ff6b00;">¥' + order.price + '</div>' +
                '<div style="color: #999; font-size: 12px;">' + (order.status === 'done' ? '已支付' : '待支付') + '</div>' +
                buttonHtml + '</div></div></div>';
        });
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<div class="empty">加载失败</div>';
    }
}

// 确认验收订单
async function completeOrder(orderId) {
    if (!confirm('确认验收完成？')) return;

    var token = localStorage.getItem('token');
    var res = await fetch(API_BASE + '/orders/' + orderId + '/complete', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token }
    });

    if (res.ok) {
        alert('验收成功');
        loadOrders();
    } else {
        alert('操作失败');
    }
}

// 加载个人资料
async function loadProfile() {
    if (!checkAuth()) return;

    document.getElementById('user-name').textContent = currentUser.name || currentUser.phone;
    document.getElementById('user-avatar').textContent = (currentUser.name || currentUser.phone).charAt(0);
    document.getElementById('user-company').textContent = currentUser.company || '未设置';
    document.getElementById('profile-name').value = currentUser.name || '';
    document.getElementById('profile-company').value = currentUser.company || '';

    var token = localStorage.getItem('token');
    try {
        var res = await fetch(API_BASE + '/my/orders', { headers: { Authorization: 'Bearer ' + token } });
        var orders = await res.json();
        document.getElementById('user-orders').textContent = orders.length;

        var res2 = await fetch(API_BASE + '/my/tasks', { headers: { Authorization: 'Bearer ' + token } });
        var tasks = await res2.json();
        document.getElementById('user-tasks').textContent = tasks.length;
    } catch (e) {}
}

// 更新资料
async function updateProfile() {
    var name = document.getElementById('profile-name').value;
    var company = document.getElementById('profile-company').value;

    var token = localStorage.getItem('token');
    var res = await fetch(API_BASE + '/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ name: name, company: company })
    });

    if (res.ok) {
        currentUser.name = name;
        currentUser.company = company;
        localStorage.setItem('user', JSON.stringify(currentUser));
        updateUserArea();
        loadProfile();
        alert('保存成功');
    } else {
        alert('保存失败');
    }
}

// 注册
async function register() {
    var phone = document.getElementById('reg-phone').value;
    var password = document.getElementById('reg-password').value;
    var role = document.getElementById('reg-role').value;
    var name = document.getElementById('reg-name').value;

    if (!phone || !password || password.length < 6) {
        showAlert('register-alert', '请填写完整信息，密码至少6位', 'error');
        return;
    }

    var res = await fetch(API_BASE + '/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password, role: role, name: name })
    });

    var data = await res.json();
    if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentUser = data.user;
        updateUserArea();
        showPage('home');
    } else {
        showAlert('register-alert', data.error || '注册失败', 'error');
    }
}

// 登录
async function login() {
    var phone = document.getElementById('login-phone').value;
    var password = document.getElementById('login-password').value;

    var res = await fetch(API_BASE + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone, password: password })
    });

    var data = await res.json();
    if (res.ok) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        currentUser = data.user;
        updateUserArea();
        showPage('home');
    } else {
        showAlert('login-alert', data.error || '登录失败', 'error');
    }
}

// 退出
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    updateUserArea();
    showPage('home');
}

// 提示
function showAlert(id, msg, type) {
    document.getElementById(id).innerHTML = '<div class="alert alert-' + type + '">' + msg + '</div>';
}

// 发布需求
document.getElementById('publish-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!checkAuth()) {
        showPage('login');
        return;
    }

    var form = e.target;
    var budget = form.budget.value.split('-');
    var formData = new FormData();
    formData.append('title', form.title.value);
    formData.append('category', form.category.value);
    formData.append('description', form.description.value);
    formData.append('budget_min', budget[0]);
    formData.append('budget_max', budget[1] || budget[0]);
    formData.append('deadline', form.deadline.value);

    var token = localStorage.getItem('token');
    var res = await fetch(API_BASE + '/tasks', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: formData
    });

    if (res.ok) {
        showAlert('publish-alert', '需求发布成功！', 'success');
        setTimeout(function() { showPage('orders'); }, 1500);
    } else {
        showAlert('publish-alert', '发布失败', 'error');
    }
});

// 初始化
checkAuth();
loadStats();
