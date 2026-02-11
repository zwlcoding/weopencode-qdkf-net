// 从 .env 文件加载环境变量
const fs = require('fs');
const path = require('path');

// 读取 .env 文件
const envPath = path.join(__dirname, '.env');
let envFromFile = {};

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length > 0) {
        envFromFile[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
}

module.exports = {
  apps: [
    {
      name: 'opencode-server',
      script: 'opencode',
      args: 'serve --port 4096 --hostname 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
        // OpenCode Server 认证
        OPENCODE_SERVER_USERNAME: envFromFile.OPENCODE_SERVER_USERNAME || 'admin',
        OPENCODE_SERVER_PASSWORD: envFromFile.OPENCODE_SERVER_PASSWORD || '',
        // API Keys
        DEEPSEEK_API_KEY: envFromFile.DEEPSEEK_API_KEY || '',
        OPENAI_API_KEY: envFromFile.OPENAI_API_KEY || '',
        ANTHROPIC_API_KEY: envFromFile.ANTHROPIC_API_KEY || '',
        OPENROUTER_API_KEY: envFromFile.OPENROUTER_API_KEY || ''
      },
      log_file: './logs/opencode-server.log',
      out_file: './logs/opencode-server-out.log',
      error_file: './logs/opencode-server-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: false,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '10s',
      autorestart: true,
      exp_backoff_restart_delay: 100
    },
    {
      name: 'wechat-opencode-bridge',
      script: './bridge.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        OPENCODE_BASE_URL: envFromFile.OPENCODE_BASE_URL || 'http://127.0.0.1:4096',
        OPENCODE_USERNAME: envFromFile.OPENCODE_USERNAME || 'admin',
        OPENCODE_SERVER_PASSWORD: envFromFile.OPENCODE_SERVER_PASSWORD || '',
        WECHAT_CORP_ID: envFromFile.WECHAT_CORP_ID || '',
        WECHAT_TOKEN: envFromFile.WECHAT_TOKEN || '',
        WECHAT_ENCODING_AES_KEY: envFromFile.WECHAT_ENCODING_AES_KEY || '',
        PORT: envFromFile.PORT || 3000
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      listen_timeout: 3000,
      health_check_grace_period: 30000,
      autorestart: true,
      exp_backoff_restart_delay: 100
    }
  ]
};