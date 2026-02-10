#!/bin/bash

# 企业微信-OpenCode 桥接服务安装脚本

set -e

echo "🚀 开始安装企业微信-OpenCode 桥接服务..."

# 检查 Node.js 版本
echo "📦 检查 Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前版本: $(node --version)"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 安装依赖
echo "📦 安装依赖..."
npm install

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "⚠️  请编辑 .env 文件并填写正确的配置信息"
else
    echo "✅ .env 文件已存在"
fi

echo ""
echo "✅ 安装完成！"
echo ""
echo "📋 下一步："
echo "   1. 编辑 .env 文件，填写正确的配置"
echo "   2. 运行 'npm start' 启动服务"
echo "   3. 或运行 'npm run dev' 以开发模式启动（支持热重载）"
echo ""
echo "📖 更多信息请查看 README.md"