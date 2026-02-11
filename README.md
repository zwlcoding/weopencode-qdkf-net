# 企业微信打通 OpenCode 桥接服务

在企业微信中直接与 OpenCode AI 对话，实现对话式编程。

## ✨ 功能特性

- 💬 **对话式编程** - 在企业微信中与 AI 直接对话
- 🤖 **多模型支持** - 支持 OpenAI、DeepSeek、Anthropic 等多种模型
- ⏱️ **超时缓存** - 自动处理超时，后台完成响应
- 🔒 **加密通信** - 支持企业微信加密模式
- 🚀 **PM2 管理** - 生产环境稳定运行，自动重启

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
npm install -g pm2
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入以下信息：
# - OpenCode Server 密码
# - API Keys (DeepSeek/OpenAI/Anthropic 等)
# - 企业微信配置
```

### 3. 使用 PM2 启动所有服务

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 📋 配置说明

### 必需环境变量

| 变量名 | 说明 | 来源 |
|--------|------|------|
| `OPENCODE_SERVER_PASSWORD` | OpenCode Server 密码 | 自定义设置 |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | DeepSeek 控制台 |
| `WECHAT_CORP_ID` | 企业微信 CorpID | 企业微信管理后台 |
| `WECHAT_TOKEN` | 企业微信 Token | 企业微信应用管理 |
| `WECHAT_ENCODING_AES_KEY` | 企业微信加密密钥 | 企业微信应用管理 |

### 可选环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `ANTHROPIC_API_KEY` | Anthropic API Key | - |
| `OPENROUTER_API_KEY` | OpenRouter API Key | - |
| `OPENCODE_BASE_URL` | OpenCode Server 地址 | `http://127.0.0.1:4096` |
| `PORT` | 桥接服务端口 | `3000` |

## 💬 使用命令

在企业微信中发送以下命令：

| 命令 | 说明 |
|------|------|
| `帮助` / `/help` | 显示命令列表 |
| `模型列表` / `/models` | 查看可用模型 |
| `当前模型` / `/current` | 查看当前使用的模型 |
| `使用模型 <provider>/<model>` | 切换模型，如 `使用模型 deepseek/deepseek-reasoner` |

### 示例

```
使用模型 openai/gpt-4o
使用模型 deepseek/deepseek-reasoner
使用模型 anthropic/claude-3-sonnet
```

## 📱 企业微信配置

1. 登录企业微信管理后台: https://work.weixin.qq.com/wework_admin
2. 进入"应用管理" → "创建应用"
3. 应用详情中找到"接收消息" → "设置"
4. 填写 Webhook URL: `http://YOUR_SERVER_IP:3000/webhook`
5. 选择加密模式，点击"保存"完成验证

## 🏗️ 架构

```
企业微信用户 → 桥接服务 (Node.js) → OpenCode Server
                     ↓
               用户 Session 缓存
                     ↓
            超时响应缓存 (10分钟)
```

## 🔧 PM2 管理命令

```bash
pm2 status                    # 查看服务状态
pm2 logs                      # 查看所有日志
pm2 logs opencode-server      # 查看 OpenCode Server 日志
pm2 logs wechat-opencode-bridge # 查看桥接服务日志
pm2 restart all               # 重启所有服务
pm2 stop all                  # 停止所有服务
```

## ⏱️ 超时处理说明

由于企业微信限制，必须在 5 秒内响应。当 AI 处理时间超过 4.5 秒时：

1. 立即返回提示："处理超时，请再次发送消息获取结果"
2. 后台继续处理 AI 请求
3. 处理完成后缓存结果
4. 用户发送任意消息（如"1"或"继续"）即可获取结果

## 🐛 故障排查

### 检查服务状态

```bash
curl http://localhost:3000/health
```

### 检查 OpenCode Server

```bash
curl -u admin:YOUR_PASSWORD http://127.0.0.1:4096/global/health
```

### 查看日志

```bash
pm2 logs
```

## 📄 许可证

MIT License