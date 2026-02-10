# 企业微信打通 OpenCode 桥接服务

在企业微信中直接与 OpenCode AI 对话，实现对话式编程。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填写正确的配置
```

### 3. 启动服务

```bash
npm start
```

## 📋 配置说明

### 必需环境变量

| 变量名 | 说明 | 来源 |
|--------|------|------|
| `OPENCODE_SERVER_PASSWORD` | OpenCode Server 密码 | 启动 OpenCode Server 时设置 |
| `WECHAT_CORP_ID` | 企业微信 CorpID | 企业微信管理后台 - 我的企业 |
| `WECHAT_TOKEN` | 企业微信 Token | 企业微信管理后台 - 应用管理 - 接收消息设置 |
| `WECHAT_ENCODING_AES_KEY` | 企业微信加密密钥 | 企业微信管理后台 - 应用管理 - 接收消息设置 |

### 可选环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCODE_BASE_URL` | OpenCode Server 地址 | `http://127.0.0.1:4096` |
| `OPENCODE_USERNAME` | OpenCode 用户名 | `admin` |
| `PORT` | 桥接服务端口 | `3000` |

## 📱 企业微信配置

1. 登录企业微信管理后台: https://work.weixin.qq.com/wework_admin
2. 进入"应用管理" → "创建应用"
3. 应用详情中找到"接收消息" → "设置"
4. 填写 Webhook URL: `http://YOUR_SERVER_IP:3000/webhook`
5. 点击"保存"完成验证

## 🏗️ 架构

```
企业微信用户 → 桥接服务 (Node.js) → OpenCode Server
                     ↓
               用户 Session 缓存
```

## 🐛 故障排查

### 检查服务状态

```bash
curl http://localhost:3000/health
```

### 检查 OpenCode 连接

```bash
curl -u admin:YOUR_PASSWORD http://127.0.0.1:4096/global/health
```

## 📄 许可证

MIT License