#!/bin/bash

# 部署脚本 - 使用 PM2 管理进程

echo "🚀 开始部署企业微信-OpenCode 桥接服务..."

# 检查 PM2
if ! command -v pm2 &> /dev/null; then
    echo "📦 安装 PM2..."
    npm install -g pm2
fi

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "❌ 缺少 .env 文件，请先复制 .env.example 并配置"
    exit 1
fi

# 安装依赖
echo "📦 安装依赖..."
npm install

# 使用 PM2 启动
echo "🚀 启动服务..."
pm2 start bridge.js --name wechat-opencode-bridge

# 保存 PM2 配置
echo "💾 保存 PM2 配置..."
pm2 save

# 设置开机自启
echo "⚙️  设置开机自启..."
pm2 startup systemd -u $USER --hp $HOME

echo ""
echo "✅ 部署完成！"
echo ""
echo "📊 查看状态: pm2 status"
echo "📜 查看日志: pm2 logs wechat-opencode-bridge"
echo "🔄 重启服务: pm2 restart wechat-opencode-bridge"
echo "🛑 停止服务: pm2 stop wechat-opencode-bridge"