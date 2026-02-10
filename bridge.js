import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.raw({ type: 'text/xml' }));

// ==================== 企业微信加解密工具 ====================

/**
 * 企业微信 AES 解密
 * @param {string} encodingAESKey - 43位加密密钥
 * @param {string} encryptedData - Base64编码的加密数据
 * @returns {object} { msg: 解密后的消息, corpId: 企业ID }
 */
function decryptWechatMsg(encodingAESKey, encryptedData) {
  try {
    // EncodingAESKey 实际上是 Base64 编码的 AES 密钥
    const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    
    // 解密
    const encryptedBuffer = Buffer.from(encryptedData, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
    decipher.setAutoPadding(false);
    
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    // 去除 PKCS7 填充
    const pad = decrypted[decrypted.length - 1];
    const content = decrypted.slice(0, decrypted.length - pad);
    
    // 企业微信加密格式: random(16字节) + msg_len(4字节网络字节序) + msg + corpId
    const msgLen = content.readUInt32BE(16);
    const msg = content.slice(20, 20 + msgLen).toString('utf8');
    const corpId = content.slice(20 + msgLen).toString('utf8');
    
    return { msg, corpId };
  } catch (error) {
    console.error('❌ 解密失败:', error.message);
    throw error;
  }
}

/**
 * 企业微信 AES 加密
 * @param {string} encodingAESKey - 43位加密密钥
 * @param {string} corpId - 企业ID
 * @param {string} message - 明文消息
 * @returns {string} Base64编码的加密数据
 */
function encryptWechatMsg(encodingAESKey, corpId, message) {
  try {
    const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    
    // 生成16字节随机数
    const randomBytes = crypto.randomBytes(16);
    
    // 消息长度（4字节网络字节序）
    const msgLenBuffer = Buffer.alloc(4);
    msgLenBuffer.writeUInt32BE(Buffer.byteLength(message, 'utf8'), 0);
    
    // 拼接: random + msg_len + msg + corpId
    const msgBuffer = Buffer.from(message, 'utf8');
    const corpIdBuffer = Buffer.from(corpId, 'utf8');
    const content = Buffer.concat([randomBytes, msgLenBuffer, msgBuffer, corpIdBuffer]);
    
    // PKCS7 填充到 AES 块大小（32字节）
    const blockSize = 32;
    const padLen = blockSize - (content.length % blockSize);
    const padBuffer = Buffer.alloc(padLen, padLen);
    const paddedContent = Buffer.concat([content, padBuffer]);
    
    // 加密
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, aesKey.slice(0, 16));
    cipher.setAutoPadding(false);
    let encrypted = cipher.update(paddedContent);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    return encrypted.toString('base64');
  } catch (error) {
    console.error('❌ 加密失败:', error.message);
    throw error;
  }
}

/**
 * 验证企业微信消息签名（加密模式）
 * @param {string} token - Token
 * @param {string} timestamp - 时间戳
 * @param {string} nonce - 随机数
 * @param {string} encryptedMsg - 加密消息
 * @param {string} msgSignature - 消息签名
 * @returns {boolean} 签名是否有效
 */
function verifyMsgSignature(token, timestamp, nonce, encryptedMsg, msgSignature) {
  const arr = [token, timestamp, nonce, encryptedMsg].sort();
  const str = arr.join('');
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  return hash === msgSignature;
}

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
 * 支持明文模式和加密模式
 */
app.get('/webhook', (req, res) => {
  const { signature, msg_signature, timestamp, nonce, echostr } = req.query;
  
  console.log('📨 收到企业微信验证请求');
  console.log('   Query:', req.query);
  
  // 检查必要参数
  if (!timestamp || !nonce || !echostr) {
    console.error('❌ 缺少必要参数');
    return res.status(400).send('Missing parameters');
  }
  
  // 明文模式：使用 signature
  if (signature) {
    if (!verifySignature(CONFIG.token, signature, timestamp, nonce)) {
      console.error('❌ 明文模式签名验证失败');
      return res.status(403).send('Invalid signature');
    }
    console.log('✅ 明文模式签名验证通过');
    return res.send(echostr);
  }
  
  // 加密模式：使用 msg_signature，需要解密 echostr
  if (msg_signature) {
    // 先验证消息签名
    if (!verifyMsgSignature(CONFIG.token, timestamp, nonce, echostr, msg_signature)) {
      console.error('❌ 加密模式消息签名验证失败');
      return res.status(403).send('Invalid msg_signature');
    }
    
    console.log('✅ 加密模式消息签名验证通过');
    
    try {
      // 解密 echostr
      const decrypted = decryptWechatMsg(CONFIG.encodingAESKey, echostr);
      console.log('🔓 解密成功，返回明文');
      return res.send(decrypted);
    } catch (error) {
      console.error('❌ 解密失败:', error.message);
      return res.status(500).send('Decrypt failed');
    }
  }
  
  console.error('❌ 缺少签名参数');
  return res.status(400).send('Missing signature');
});

/**
 * 接收企业微信消息（POST 请求）
 * 处理用户发送的消息并返回 OpenCode AI 响应
 * 支持明文模式和加密模式
 */
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { signature, msg_signature, timestamp, nonce } = req.query;
    
    if (!timestamp || !nonce) {
      console.error('❌ POST 请求缺少时间戳或随机数');
      return res.status(400).send('Missing parameters');
    }
    
    const xml = req.body.toString();
    res.type('application/xml');
    
    let msg, userId, content, encryptMode = false;
    
    // 明文模式
    if (signature) {
      if (!verifySignature(CONFIG.token, signature, timestamp, nonce)) {
        console.error('❌ 明文模式签名验证失败');
        return res.status(403).send('Invalid signature');
      }
      
      const parsedMsg = parseXml(xml);
      msg = parsedMsg;
      userId = parsedMsg.FromUserName;
      content = parsedMsg.Content;
    }
    // 加密模式
    else if (msg_signature) {
      encryptMode = true;
      const parsedMsg = parseXml(xml);
      const encryptedData = parsedMsg.Encrypt;
      
      if (!encryptedData) {
        console.error('❌ 加密模式缺少 Encrypt 字段');
        return res.status(400).send('Missing Encrypt field');
      }
      
      // 验证消息签名
      if (!verifyMsgSignature(CONFIG.token, timestamp, nonce, encryptedData, msg_signature)) {
        console.error('❌ 加密模式消息签名验证失败');
        return res.status(403).send('Invalid msg_signature');
      }
      
      // 解密消息
      const decrypted = decryptWechatMsg(CONFIG.encodingAESKey, encryptedData);
      msg = parseXml(decrypted.msg);
      userId = msg.FromUserName;
      content = msg.Content;
      
      console.log(`🔓 解密后消息: ${decrypted.msg.substring(0, 200)}`);
    }
    else {
      console.error('❌ POST 请求缺少签名参数');
      return res.status(400).send('Missing signature');
    }
    
    console.log(`\n📩 收到消息 - 用户: ${userId}`);
    console.log(`💬 内容: ${content?.substring(0, 100)}${content?.length > 100 ? '...' : ''}`);
    
    // 获取或创建用户 Session
    const sessionId = await getOrCreateSession(userId);
    
    // 发送消息到 OpenCode
    const responseText = await sendToOpenCode(sessionId, content || '');
    
    console.log(`🤖 AI 响应: ${responseText.substring(0, 100)}...`);
    console.log(`⏱️ 处理耗时: ${Date.now() - startTime}ms`);
    
    // 构建回复
    if (encryptMode) {
      // 加密模式：构建加密回复
      const timestamp = Math.floor(Date.now() / 1000);
      const replyMsg = `<xml>
<ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${responseText.substring(0, 2048)}]]></Content>
</xml>`;
      
      const encryptedReply = encryptWechatMsg(CONFIG.encodingAESKey, CONFIG.corpId, replyMsg);
      const replySignature = crypto.createHash('sha1')
        .update([CONFIG.token, timestamp, nonce, encryptedReply].sort().join(''))
        .digest('hex');
      
      const replyXml = `<xml>
<Encrypt><![CDATA[${encryptedReply}]]></Encrypt>
<MsgSignature><![CDATA[${replySignature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
      
      res.send(replyXml);
    } else {
      // 明文模式：直接返回
      const replyXml = buildReplyXml(msg, responseText);
      res.send(replyXml);
    }
    
  } catch (error) {
    console.error('❌ 处理消息失败:', error.message);
    console.error(error.stack);
    
    res.status(500).send('Internal Server Error');
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