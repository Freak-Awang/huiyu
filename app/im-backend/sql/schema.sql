-- ============================================
-- IM Backend Database Schema
-- MySQL 8.0
-- ============================================

-- 用户表
CREATE TABLE IF NOT EXISTS sys_user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '用户ID',
    username VARCHAR(64) NOT NULL COMMENT '登录账号',
    password VARCHAR(128) NOT NULL COMMENT '密码(BCrypt加密)',
    nickname VARCHAR(64) NOT NULL COMMENT '显示昵称',
    email VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
    phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
    avatar VARCHAR(256) DEFAULT NULL COMMENT '头像URL',
    dept_id BIGINT DEFAULT NULL COMMENT '所属部门ID',
    role VARCHAR(32) NOT NULL DEFAULT 'user' COMMENT '角色: admin/user',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0=禁用, 1=启用',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_username (username),
    INDEX idx_dept_id (dept_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 部门表
CREATE TABLE IF NOT EXISTS sys_dept (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '部门ID',
    name VARCHAR(64) NOT NULL COMMENT '部门名称',
    parent_id BIGINT NOT NULL DEFAULT 0 COMMENT '父部门ID, 0表示顶级',
    sort_order INT NOT NULL DEFAULT 0 COMMENT '排序号',
    status TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 0=禁用, 1=启用',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_parent_id (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='部门表';

-- IM会话表
CREATE TABLE IF NOT EXISTS im_conversation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
    type TINYINT NOT NULL COMMENT '会话类型: 1=单聊, 2=群聊',
    name VARCHAR(128) DEFAULT NULL COMMENT '会话名称(群聊时有值)',
    avatar VARCHAR(256) DEFAULT NULL COMMENT '会话头像',
    owner_id BIGINT DEFAULT NULL COMMENT '群主用户ID(群聊时)',
    last_message VARCHAR(512) DEFAULT NULL COMMENT '最后一条消息摘要',
    last_message_time DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_type (type),
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IM会话表';

-- IM会话成员表
CREATE TABLE IF NOT EXISTS im_conversation_member (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '成员ID',
    conversation_id BIGINT NOT NULL COMMENT '会话ID',
    user_id BIGINT NOT NULL COMMENT '用户ID',
    role VARCHAR(32) NOT NULL DEFAULT 'member' COMMENT '角色: owner/admin/member',
    is_pinned TINYINT NOT NULL DEFAULT 0 COMMENT '是否置顶: 0=否, 1=是',
    last_read_time DATETIME DEFAULT NULL COMMENT '最后已读时间',
    join_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    UNIQUE KEY uk_conv_user (conversation_id, user_id),
    INDEX idx_user_id (user_id),
    INDEX idx_pinned (is_pinned)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IM会话成员表';

-- IM消息表
CREATE TABLE IF NOT EXISTS im_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
    conversation_id BIGINT NOT NULL COMMENT '会话ID',
    sender_id BIGINT NOT NULL COMMENT '发送人ID',
    message_type VARCHAR(32) NOT NULL COMMENT '消息类型: TEXT/IMAGE/FILE',
    content TEXT NOT NULL COMMENT '消息内容(JSON格式)',
    status VARCHAR(32) NOT NULL DEFAULT 'SENT' COMMENT '消息状态: SENT',
    client_msg_id VARCHAR(64) DEFAULT NULL COMMENT '客户端消息ID, 用于幂等',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    INDEX idx_conv_time (conversation_id, create_time),
    INDEX idx_sender (sender_id),
    UNIQUE KEY uk_client_msg (sender_id, client_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IM消息表';

-- 文件表
CREATE TABLE IF NOT EXISTS im_file (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '文件ID',
    original_name VARCHAR(256) NOT NULL COMMENT '原始文件名',
    stored_name VARCHAR(128) NOT NULL COMMENT '存储文件名(UUID)',
    file_path VARCHAR(512) NOT NULL COMMENT '文件存储路径',
    file_size BIGINT NOT NULL COMMENT '文件大小(字节)',
    content_type VARCHAR(128) DEFAULT NULL COMMENT 'MIME类型',
    uploader_id BIGINT NOT NULL COMMENT '上传人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
    INDEX idx_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文件表';

-- ============================================
-- 初始数据
-- ============================================

-- 默认部门
INSERT INTO sys_dept (name, parent_id, sort_order, status) VALUES
('总公司', 0, 0, 1);

-- 默认管理员 (密码: admin123)
INSERT INTO sys_user (username, password, nickname, role, status) VALUES
('admin', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', '系统管理员', 'admin', 1);
