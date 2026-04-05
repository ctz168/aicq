/**
 * ClickHouse 连接管理器
 * 使用 @clickhouse/client 官方驱动
 */
import { createClient, ClickHouseClient } from '@clickhouse/client';
import { config } from '../config';

let client: ClickHouseClient | null = null;

export async function getClickHouseClient(): Promise<ClickHouseClient> {
  if (!client) {
    client = createClient({
      url: config.clickhouseUrl,
      username: config.clickhouseUser,
      password: config.clickhousePassword,
      database: config.clickhouseDatabase,
      request_timeout: 30_000,
      max_open_connections: 10,
    });
  }
  return client;
}

export async function closeClickHouse(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

/**
 * 初始化 ClickHouse 数据库和表
 */
export async function initClickHouseSchema(): Promise<void> {
  const ch = await getClickHouseClient();

  // 创建数据库（如果不存在）
  await ch.exec({
    query: `CREATE DATABASE IF NOT EXISTS ${config.clickhouseDatabase}`,
  });

  // ─── accounts 表 ──────────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS accounts
      (
        id String,
        type Enum8('human' = 1, 'ai' = 2),
        email Nullable(String),
        phone Nullable(String),
        password_hash Nullable(String),
        display_name Nullable(String),
        agent_name Nullable(String),
        fingerprint Nullable(String),
        public_key String,
        created_at DateTime64(3),
        last_login_at DateTime64(3),
        status Enum8('active' = 1, 'disabled' = 2, 'suspended' = 3),
        friends Array(String),
        max_friends UInt16,
        visit_permissions Array(String),
        updated_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── sessions 表 ──────────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS sessions
      (
        id String,
        account_id String,
        token String,
        refresh_token String,
        device_info Nullable(String),
        created_at DateTime64(3),
        expires_at DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY (account_id, id)
      PARTITION BY toYYYYMM(expires_at)
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── verification_codes 表 ────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS verification_codes
      (
        id String,
        target String,
        code String,
        type Enum8('email' = 1, 'phone' = 2),
        purpose Enum8('register' = 1, 'login' = 2, 'reset_password' = 3),
        attempts UInt8,
        max_attempts UInt8,
        expires_at DateTime64(3),
        created_at DateTime64(3),
        verified_at Nullable(DateTime64(3))
      )
      ENGINE = MergeTree()
      ORDER BY (type, target, purpose)
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── temp_numbers 表 ──────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS temp_numbers
      (
        number String,
        node_id String,
        expires_at DateTime64(3),
        created_at DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY number
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── nodes 表 ─────────────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS nodes
      (
        id String,
        public_key String,
        last_seen DateTime64(3),
        socket_id Nullable(String),
        friend_count UInt16,
        friends Array(String),
        gateway_url Nullable(String),
        updated_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── friend_requests 表 ───────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS friend_requests
      (
        id String,
        from_id String,
        to_id String,
        status Enum8('pending' = 1, 'accepted' = 2, 'rejected' = 3),
        message Nullable(String),
        granted_permissions Array(String),
        created_at DateTime64(3),
        updated_at DateTime64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── groups 表 ────────────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS groups
      (
        id String,
        name String,
        owner_id String,
        members_json String,
        created_at DateTime64(3),
        updated_at DateTime64(3),
        max_members UInt16,
        description Nullable(String),
        avatar Nullable(String)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── group_messages 表 ────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS group_messages
      (
        id String,
        group_id String,
        from_id String,
        sender_name String,
        type String,
        content String,
        media Nullable(String),
        file_info Nullable(String),
        timestamp DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY (group_id, timestamp)
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── handshake_sessions 表 ────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS handshake_sessions
      (
        id String,
        requester_id String,
        target_node_id String,
        status Enum8('initiated' = 1, 'responded' = 2, 'confirmed' = 3, 'failed' = 4),
        response_data Nullable(String),
        confirm_data Nullable(String),
        created_at DateTime64(3),
        expires_at DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── pending_requests 表 ──────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS pending_requests
      (
        target_node_id String,
        from_node_id String,
        temp_number String,
        session_id String,
        created_at DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY target_node_id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── node_permissions 表 ──────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS node_permissions
      (
        node_id String,
        friend_id String,
        permissions Array(String),
        updated_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY (node_id, friend_id)
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── file_transfers 表 ────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS file_transfers
      (
        id String,
        sender_id String,
        receiver_id String,
        file_name String,
        file_size UInt64,
        file_hash String,
        total_chunks UInt32,
        chunk_size UInt32,
        chunks_received_json String,
        created_at DateTime64(3),
        completed_at Nullable(DateTime64(3)),
        cancelled_at Nullable(DateTime64(3)),
        updated_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── notifications 表 ─────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS notifications
      (
        id String,
        account_id String,
        chat_id String,
        sender_id String,
        sender_name String,
        message_preview String,
        is_group UInt8,
        read_flag UInt8 DEFAULT 0,
        created_at DateTime64(3)
      )
      ENGINE = MergeTree()
      ORDER BY (account_id, created_at)
      SETTINGS index_granularity = 8192
    `,
  });

  // ─── sub_agents 表 ────────────────────────────────────
  await ch.exec({
    query: `
      CREATE TABLE IF NOT EXISTS sub_agents
      (
        id String,
        parent_message_id String,
        task String,
        context Nullable(String),
        status Enum8('running' = 1, 'completed' = 2, 'waiting_human' = 3, 'error' = 4),
        output String DEFAULT '',
        created_at DateTime64(3),
        updated_at DateTime64(3) DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(updated_at)
      ORDER BY id
      SETTINGS index_granularity = 8192
    `,
  });

  console.log('[clickhouse] Schema initialized successfully');
}
