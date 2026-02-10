# 企业微信打通 OpenCode 项目

> 通过企业微信对话操作 OpenCode 进行编码
> 将企业微信变为你的 AI 编程助手

---

## 📋 功能特性

- 💬 **对话式编程** - 在企业微信中直接与 OpenCode 对话
- 🔒 **多用户隔离** - 每个用户独立 Session，互不干扰
- 🚀 **实时响应** - 消息秒级送达，编码结果即时返回
- 📱 **移动端友好** - 随时随地用手机指挥 AI 写代码

---

## 🏗️ 架构图

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   企业微信用户   │────▶│   桥接服务        │────▶│  OpenCode Server │
│  (发送消息)      │     │  (Node.js)       │     │  (本地 127.0.0.1)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  用户 Session    │
                        │  缓存管理        │
                        └──────────────────┘
```

---

## 🚀 快速开始

### 前提条件

- Ubuntu 20.04+ / Debian 10+ / macOS
- Node.js 18+
- 企业微信管理员权限
- 一台有公网 IP 的服务器

### 1. 安装 OpenCode CLI

```bash
# 使用官方安装脚本
curl -fsSL https://opencode.ai/install | bash

# 验证安装
opencode --version
```

### 2. 启动 OpenCode Server

```bash
# 创建工作目录
mkdir -p ~/opencode-wechat
cd ~/opencode-wechat

# 设置强密码（至少16位，包含大小写+数字+特殊字符）
export OPENCODE_SERVER_PASSWORD="your-strong-password-here"
export OPENCODE_SERVER_USERNAME="admin"

# 启动服务（只监听本地，提高安全性）
nohup opencode serve \
  --port 4096 \
  --hostname 127.0.0.1 \
  > server.log 2>&1 &

# 验证启动
curl -u admin:"$OPENCODE_SERVER_PASSWORD" \
  http://127.0.0.1:4096/global/health
```

### 3. 部署桥接服务

```bash
# 创建项目目录
mkdir -p ~/wechat-bridge
cd ~/wechat-bridge

# 初始化项目
npm init -y
npm install express @opencode-ai/sdk

# 创建主文件
touch bridge.js
```

将以下代码写入 `bridge.js`：

```javascript
import express from 'express';
import crypto from 'crypto';
import { createOpencodeClient } from '@opencode-ai/sdk';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'text/xml' }));

// 配置
const CONFIG = {
  // 企业微信配置（从环境变量读取）
  corpId: process.env.WECHAT_CORP_ID,
  token: process.env.WECHAT_TOKEN,
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
  
  // OpenCode 配置
  opencodeBaseUrl: 'http://127.0.0.1:4096',
  opencodeUsername: 'admin',
  opencodePassword: process.env.OPENCODE_SERVER_PASSWORD,
  
  // 桥接服务端口
  port: 3000
};

// 创建 OpenCode 客户端
const opencode = createOpencodeClient({
  baseUrl: CONFIG.opencodeBaseUrl,
  fetch: (url, options) => {
    const auth = Buffer.from(
      `${CONFIG.opencodeUsername}:${CONFIG.opencodePassword}`
    ).toString('base64');
    options.headers = options.headers || {};
    options.headers['Authorization'] = `Basic ${auth}`;
    return fetch(url, options);
  }
});

// 用户 Session 缓存
const userSessions = new Map();

// 企业微信消息签名验证
function verifySignature(token, signature, timestamp, nonce) {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
}

// 企业微信回调验证（GET 请求）
app.get('/webhook', (req, res) => {
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  
  if (!verifySignature(CONFIG.token, msg_signature, timestamp, nonce)) {
    return res.status(403).send('Invalid signature');
  }
  
  res.send(echostr);
});

// 接收企业微信消息（POST 请求）
app.post('/webhook', async (req, res) => {
  try {
    const xml = req.body.toString();
    const msg = parseXml(xml);
    
    const userId = msg.FromUserName;
    const content = msg.Content;
    
    console.log(`收到消息 - 用户: ${userId}, 内容: ${content}`);
    
    // 获取或创建用户 Session
    let sessionId = userSessions.get(userId);
    if (!sessionId) {
      const session = await opencode.session.create({
        body: { title: `WeChat-${userId}` }
      });
      sessionId = session.id;
      userSessions.set(userId, sessionId);
      console.log(`创建新 Session: ${sessionId}`);
    }
    
    // 发送消息到 OpenCode
    const result = await opencode.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: content }]
      }
    });
    
    // 提取 OpenCode 响应
    const responseText = result.data.parts
      .filter(p => p.type === 'text')
      .map(p => p.text)
      .join('\n');
    
    console.log(`OpenCode 响应: ${responseText.substring(0, 100)}...`);
    
    // 返回给企业微信
    const replyXml = buildReplyXml(msg, responseText);
    res.type('application/xml');
    res.send(replyXml);
    
  } catch (error) {
    console.error('处理消息失败:', error);
    res.status(500).send('Internal Server Error');
  }
});

// 解析 XML
function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/\w+>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  return result;
}

// 构建回复 XML
function buildReplyXml(msg, content) {
  const timestamp = Math.floor(Date.now() / 1000);
  return `<xml>
<ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content.substring(0, 2048)}]]></Content>
</xml>`;
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`✅ 桥接服务运行在 http://0.0.0.0:${CONFIG.port}`);
  console.log(`📱 Webhook URL: http://YOUR_SERVER_IP:${CONFIG.port}/webhook`);
});
```

### 4. 配置环境变量

创建 `.env` 文件（**不要提交到 Git！**）：

```bash
# OpenCode 配置
export OPENCODE_SERVER_PASSWORD="your-strong-password-here"

# 企业微信配置（从企业微信后台获取）
export WECHAT_CORP_ID="your-corp-id"
export WECHAT_TOKEN="your-token"
export WECHAT_ENCODING_AES_KEY="your-encoding-aes-key"
```

添加 `.gitignore`：

```gitignore
# 环境变量
.env
.env.local

# 日志
*.log
logs/

# Node.js
node_modules/
npm-debug.log*

# OpenCode
.opencode/
```

### 5. 启动桥接服务

```bash
# 加载环境变量
source .env

# 启动服务
node bridge.js
```

### 6. 使用 PM2 保持运行（生产环境）

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start bridge.js --name wechat-bridge

# 查看状态
pm2 status

# 查看日志
pm2 logs wechat-bridge

# 设置开机自启
pm2 startup
pm2 save
```

---

## 📱 企业微信配置

### 1. 获取企业凭证

1. 登录企业微信管理后台：https://work.weixin.qq.com/wework_admin
2. 点击"我的企业" → 找到 **CorpID（企业ID）**
3. 记录下来备用

### 2. 创建自建应用

1. 进入"应用管理"
2. 点击"创建应用"
3. 填写应用名称、上传 Logo
4. 选择可见成员
5. 创建后记录 **AgentID**

### 3. 配置接收消息

1. 进入应用详情
2. 找到"接收消息" → 点击"设置"
3. 填写：
   - **URL**：`http://YOUR_SERVER_IP:3000/webhook`
   - **Token**：自定义（3-32位字符，如 `wechat2024`）
   - **EncodingAESKey**：点击"随机生成"
4. 点击"保存"

**注意**：保存时会向你的服务器发送验证请求，确保桥接服务已启动。

### 4. 更新环境变量

将企业微信后台获取的信息填入 `.env` 文件：

```bash
export WECHAT_CORP_ID="wx1234567890abcdef"
export WECHAT_TOKEN="wechat2024"
export WECHAT_ENCODING_AES_KEY="abcdefghijklmnopqrstuvwxyz1234567890ABCDEF"
```

重启桥接服务：

```bash
pm2 restart wechat-bridge
```

---

## 🔒 安全配置

### 1. 防火墙设置

```bash
# 只开放桥接服务端口
sudo ufw allow 3000/tcp

# 查看防火墙状态
sudo ufw status
```

### 2. 密码安全

- OpenCode 密码至少 16 位，包含大小写、数字、特殊字符
- 企业微信 Token 使用随机字符串
- 所有密码保存在 `.env` 文件，不提交到代码仓库

### 3. 网络安全

- OpenCode Server 只监听 127.0.0.1（本地）
- 桥接服务只开放必要的端口
- 定期检查服务器日志

---

## 🐛 故障排查

### 问题 1：OpenCode Server 无法启动

```bash
# 检查进程
pgrep -f "opencode serve"

# 查看日志
cat ~/opencode-wechat/server.log
```

### 问题 2：桥接服务无法连接 OpenCode

```bash
# 测试本地连接
curl -u admin:YOUR_PASSWORD http://127.0.0.1:4096/global/health
```

### 问题 3：企业微信验证失败

- 检查 Token 是否正确设置
- 检查服务器 3000 端口是否开放
- 查看桥接服务日志

### 问题 4：消息发送成功但无回复

- 检查 OpenCode Server 是否正常运行
- 查看桥接服务日志中的错误信息
- 确认 API Key 是否配置正确

---

## 📁 项目结构

```
wechat-opencode-bridge/
├── bridge.js           # 主程序
├── package.json        # 依赖配置
├── .env               # 环境变量（不提交）
├── .env.example       # 环境变量示例
├── .gitignore         # Git 忽略配置
├── README.md          # 项目说明
└── docs/
    └── deploy.md      # 详细部署文档
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

## 🔗 参考链接

- [OpenCode 官网](https://opencode.ai)
- [OpenCode Server 文档](https://opencode.ai/docs/server/)
- [OpenCode SDK 文档](https://opencode.ai/docs/sdk/)
- [企业微信开发者中心](https://developer.work.weixin.qq.com/)

---

**提示**：首次部署时，请务必将示例中的占位符（如 `your-strong-password-here`、`YOUR_SERVER_IP`）替换为实际值。
