import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';

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
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL || 'http://127.0.0.1:4096',
  opencodeUsername: process.env.OPENCODE_USERNAME || 'admin',
  opencodePassword: process.env.OPENCODE_SERVER_PASSWORD,
  
  // 桥接服务端口
  port: process.env.PORT || 3000
};

// 验证配置
function validateConfig() {
  const required = [
    'WECHAT_CORP_ID',
    'WECHAT_TOKEN',
    'WECHAT_ENCODING_AES_KEY',
    'OPENCODE_SERVER_PASSWORD'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error('❌ 缺少必要的环境变量:', missing.join(', '));
    console.error('请复制 .env.example 为 .env 并填写正确的配置');
    process.exit(1);
  }
}

// 用户 Session 缓存（userId -> sessionId）
const userSessions = new Map();

/**
 * 企业微信消息签名验证
 * @param {string} token - 配置的 Token
 * @param {string} signature - 消息签名
 * @param {string} timestamp - 时间戳
 * @param {string} nonce - 随机数
 * @returns {boolean} 签名是否有效
 */
function verifySignature(token, signature, timestamp, nonce) {
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === signature;
}

/**
 * 创建 OpenCode HTTP 请求
 * @param {string} path - API 路径
 * @param {object} options - fetch 选项
 * @returns {Promise<Response>} fetch 响应
 */
async function opencodeRequest(path, options = {}) {
  const auth = Buffer.from(
    `${CONFIG.opencodeUsername}:${CONFIG.opencodePassword}`
  ).toString('base64');
  
  const url = `${CONFIG.opencodeBaseUrl}${path}`;
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenCode API 错误 (${response.status}): ${text}`);
  }
  
  return response.json();
}

/**
 * 获取或创建用户 Session
 * @param {string} userId - 企业微信用户ID
 * @returns {Promise<string>} Session ID
 */
async function getOrCreateSession(userId) {
  let sessionId = userSessions.get(userId);
  
  if (!sessionId) {
    console.log(`🆕 为用户 ${userId} 创建新 Session...`);
    
    const session = await opencodeRequest('/session', {
      method: 'POST',
      body: JSON.stringify({ 
        title: `WeChat-${userId.substring(0, 8)}`,
        description: `企业微信用户 ${userId} 的会话`
      })
    });
    
    sessionId = session.id;
    userSessions.set(userId, sessionId);
    console.log(`✅ 创建 Session: ${sessionId}`);
  } else {
    console.log(`📂 使用现有 Session: ${sessionId}`);
  }
  
  return sessionId;
}

/**
 * 发送消息到 OpenCode
 * @param {string} sessionId - Session ID
 * @param {string} content - 用户消息内容
 * @returns {Promise<string>} AI 响应文本
 */
async function sendToOpenCode(sessionId, content) {
  const result = await opencodeRequest(`/session/${sessionId}/prompt`, {
    method: 'POST',
    body: JSON.stringify({
      parts: [{ type: 'text', text: content }]
    })
  });
  
  // 提取文本响应
  const responseText = result.data?.parts
    ?.filter(p => p.type === 'text')
    ?.map(p => p.text)
    ?.join('\n') || '抱歉，未能获取到有效响应';
  
  return responseText;
}

/**
 * 解析 XML 消息
 * @param {string} xml - XML 字符串
 * @returns {object} 解析后的消息对象
 */
function parseXml(xml) {
  const result = {};
  const regex = /<(\w+)>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/\w+>/g;
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    result[match[1]] = match[2];
  }
  
  return result;
}

/**
 * 构建回复 XML
 * @param {object} msg - 原始消息对象
 * @param {string} content - 回复内容
 * @returns {string} XML 字符串
 */
function buildReplyXml(msg, content) {
  const timestamp = Math.floor(Date.now() / 1000);
  // 企业微信消息长度限制为 2048 字符
  const truncatedContent = content.substring(0, 2048);
  
  return `<xml>
<ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${truncatedContent}]]></Content>
</xml>`;
}

// ==================== 路由处理 ====================

/**
 * 企业微信回调验证（GET 请求）
 * 用于企业微信保存配置时验证服务器
 */
app.get('/webhook', (req, res) => {
  // 企业微信明文模式使用 signature，加密模式使用 msg_signature
  const signature = req.query.signature || req.query.msg_signature;
  const { timestamp, nonce, echostr } = req.query;
  
  console.log('📨 收到企业微信验证请求');
  console.log('   Query:', req.query);
  
  if (!signature || !timestamp || !nonce || !echostr) {
    console.error('❌ 缺少必要参数');
    return res.status(400).send('Missing parameters');
  }
  
  if (!verifySignature(CONFIG.token, signature, timestamp, nonce)) {
    console.error('❌ 签名验证失败');
    console.error('   Token:', CONFIG.token);
    console.error('   Signature:', signature);
    console.error('   Timestamp:', timestamp);
    console.error('   Nonce:', nonce);
    return res.status(403).send('Invalid signature');
  }
  
  console.log('✅ 签名验证通过');
  res.send(echostr);
});

/**
 * 接收企业微信消息（POST 请求）
 * 处理用户发送的消息并返回 OpenCode AI 响应
 */
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    // 验证签名（明文模式使用 signature，加密模式使用 msg_signature）
    const signature = req.query.signature || req.query.msg_signature;
    const { timestamp, nonce } = req.query;
    
    if (!signature || !timestamp || !nonce) {
      console.error('❌ POST 请求缺少签名参数');
      return res.status(400).send('Missing signature parameters');
    }
    
    if (!verifySignature(CONFIG.token, signature, timestamp, nonce)) {
      console.error('❌ POST 签名验证失败');
      return res.status(403).send('Invalid signature');
    }
    
    const xml = req.body.toString();
    const msg = parseXml(xml);
    
    const userId = msg.FromUserName;
    const content = msg.Content;
    
    console.log(`\n📩 收到消息 - 用户: ${userId}`);
    console.log(`💬 内容: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`);
    
    // 快速响应，避免企业微信超时
    res.type('application/xml');
    
    // 获取或创建用户 Session
    const sessionId = await getOrCreateSession(userId);
    
    // 发送消息到 OpenCode
    const responseText = await sendToOpenCode(sessionId, content);
    
    console.log(`🤖 AI 响应: ${responseText.substring(0, 100)}...`);
    console.log(`⏱️ 处理耗时: ${Date.now() - startTime}ms`);
    
    // 构建并返回 XML 回复
    const replyXml = buildReplyXml(msg, responseText);
    res.send(replyXml);
    
  } catch (error) {
    console.error('❌ 处理消息失败:', error.message);
    console.error(error.stack);
    
    // 返回友好的错误消息
    const errorXml = buildReplyXml(
      parseXml(req.body.toString()),
      '抱歉，处理消息时出现错误，请稍后重试。'
    );
    res.send(errorXml);
  }
});

/**
 * 健康检查端点
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeSessions: userSessions.size
  });
});

/**
 * 获取所有活跃 Session（调试用）
 */
app.get('/sessions', (req, res) => {
  const sessions = Array.from(userSessions.entries()).map(([userId, sessionId]) => ({
    userId: userId.substring(0, 8) + '...',
    sessionId: sessionId.substring(0, 16) + '...'
  }));
  
  res.json({
    count: userSessions.size,
    sessions
  });
});

// ==================== 启动服务 ====================

validateConfig();

app.listen(CONFIG.port, '0.0.0.0', () => {
  console.log(`\n🚀 企业微信-OpenCode 桥接服务已启动`);
  console.log(`📡 服务地址: http://0.0.0.0:${CONFIG.port}`);
  console.log(`🔗 Webhook URL: http://YOUR_SERVER_IP:${CONFIG.port}/webhook`);
  console.log(`❤️  健康检查: http://YOUR_SERVER_IP:${CONFIG.port}/health`);
  console.log(`\n📋 配置信息:`);
  console.log(`   - OpenCode: ${CONFIG.opencodeBaseUrl}`);
  console.log(`   - 用户名: ${CONFIG.opencodeUsername}`);
  console.log(`\n💡 请确保:`);
  console.log(`   1. OpenCode Server 已在 ${CONFIG.opencodeBaseUrl} 运行`);
  console.log(`   2. 企业微信已配置 Webhook URL`);
  console.log(`   3. 服务器防火墙已开放 ${CONFIG.port} 端口`);
  console.log();
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('\n🛑 收到 SIGTERM 信号，正在关闭服务...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 收到 SIGINT 信号，正在关闭服务...');
  process.exit(0);
});