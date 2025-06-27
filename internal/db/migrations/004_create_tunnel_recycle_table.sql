-- 创建隧道回收站表，用于存储已删除但可能需要恢复的隧道记录
CREATE TABLE IF NOT EXISTS "TunnelRecycle" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    endpointId INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('server', 'client')),
    tunnelAddress TEXT NOT NULL,
    tunnelPort TEXT NOT NULL,
    targetAddress TEXT NOT NULL,
    targetPort TEXT NOT NULL,
    tlsMode TEXT NOT NULL DEFAULT 'inherit' CHECK (tlsMode IN ('inherit', 'mode0', 'mode1', 'mode2')),
    certPath TEXT,
    keyPath TEXT,
    logLevel TEXT NOT NULL DEFAULT 'inherit' CHECK (logLevel IN ('inherit', 'debug', 'info', 'warn', 'error')),
    commandLine TEXT NOT NULL,
    instanceId TEXT,
    password TEXT DEFAULT '',
    restart BOOLEAN DEFAULT FALSE,
    tcpRx INTEGER NOT NULL DEFAULT 0,
    tcpTx INTEGER NOT NULL DEFAULT 0,
    udpRx INTEGER NOT NULL DEFAULT 0,
    udpTx INTEGER NOT NULL DEFAULT 0,
    min INTEGER,
    max INTEGER,
    FOREIGN KEY (endpointId) REFERENCES "Endpoint"(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tunnel_recycle_endpointId ON "TunnelRecycle"(endpointId);
