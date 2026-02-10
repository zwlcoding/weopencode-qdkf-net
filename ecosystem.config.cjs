module.exports = {
  apps: [{
    name: 'wechat-opencode-bridge',
    script: './bridge.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      OPENCODE_BASE_URL: 'http://127.0.0.1:4096',
      OPENCODE_USERNAME: 'admin',
      OPENCODE_SERVER_PASSWORD: '',
      WECHAT_CORP_ID: '',
      WECHAT_TOKEN: '',
      WECHAT_ENCODING_AES_KEY: '',
      PORT: 3000
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
    // 健康检查
    health_check_grace_period: 30000,
    // 自动重启
    autorestart: true,
    // 崩溃后自动重启
    exp_backoff_restart_delay: 100
  }]
};