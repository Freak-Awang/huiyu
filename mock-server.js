const http = require('http')

const MOCK_TOKEN = 'mock-jwt-token-2024-enterprise-im'
const NOW = new Date().toISOString()

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS,PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  })
  res.end(JSON.stringify(data))
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch { resolve({}) }
    })
  })
}

const ADMIN_USER = {
  id: 1,
  username: 'admin',
  nickname: '系统管理员',
  email: 'admin@company.com',
  phone: '13800138000',
  avatar: '',
  role: 'admin',
  deptId: 1,
  deptName: '总公司',
  status: 1,
  createdAt: NOW,
}

const USERS = [
  {
    id: 1, username: 'admin', nickname: '系统管理员', email: 'admin@company.com',
    phone: '13800138000', role: 'admin', deptId: 1, deptName: '总公司', status: 1, createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 2, username: 'zhangsan', nickname: '张三', email: 'zhangsan@company.com',
    phone: '13800138001', role: 'user', deptId: 2, deptName: '技术部', status: 1, createdAt: '2025-01-02T00:00:00Z',
  },
  {
    id: 3, username: 'lisi', nickname: '李四', email: 'lisi@company.com',
    phone: '13800138002', role: 'user', deptId: 3, deptName: '美术部', status: 1, createdAt: '2025-01-03T00:00:00Z',
  },
  {
    id: 4, username: 'wangwu', nickname: '王五', email: 'wangwu@company.com',
    phone: '13800138003', role: 'user', deptId: 4, deptName: '原画组', status: 1, createdAt: '2025-01-04T00:00:00Z',
  },
  {
    id: 5, username: 'zhaoliu', nickname: '赵六', email: 'zhaoliu@company.com',
    phone: '13800138004', role: 'user', deptId: 5, deptName: '3D组', status: 1, createdAt: '2025-01-05T00:00:00Z',
  },
]

const DEPTS = [
  {
    id: 1, deptId: '1', name: '总公司', parentId: null, sortOrder: 0, status: 1,
    children: [
      {
        id: 2, deptId: '2', name: '技术部', parentId: 1, sortOrder: 1, status: 1,
        children: [],
      },
      {
        id: 3, deptId: '3', name: '美术部', parentId: 1, sortOrder: 2, status: 1,
        children: [
          { id: 4, deptId: '4', name: '原画组', parentId: 3, sortOrder: 1, status: 1, children: [] },
          { id: 5, deptId: '5', name: '3D组', parentId: 3, sortOrder: 2, status: 1, children: [] },
          { id: 6, deptId: '6', name: 'AIGC组', parentId: 3, sortOrder: 3, status: 1, children: [] },
        ],
      },
      {
        id: 7, deptId: '7', name: '行政部', parentId: 1, sortOrder: 3, status: 1,
        children: [],
      },
    ],
  },
]

const CONVERSATIONS = [
  {
    conversationId: '1',
    type: 'GROUP',
    name: '技术部群',
    avatar: '',
    lastMessage: {
      messageId: '1',
      senderId: '2',
      senderName: '张三',
      content: '大家好，欢迎使用企业IM',
      messageType: 'TEXT',
      createdAt: '2025-05-20T10:30:00Z',
    },
    memberCount: 3,
    members: [{ userId: '2', nickname: '张三' }, { userId: '5', nickname: '赵六' }],
    pinned: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-05-20T10:30:00Z',
  },
  {
    conversationId: '2',
    type: 'GROUP',
    name: '美术部全员',
    avatar: '',
    lastMessage: {
      messageId: '2',
      senderId: '3',
      senderName: '李四',
      content: '今天下午3点开会',
      messageType: 'TEXT',
      createdAt: '2025-05-20T09:00:00Z',
    },
    memberCount: 5,
    members: [{ userId: '3', nickname: '李四' }],
    pinned: true,
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-05-20T09:00:00Z',
  },
  {
    conversationId: '3',
    type: 'SINGLE',
    name: '张三',
    avatar: '',
    lastMessage: {
      messageId: '3',
      senderId: '1',
      senderName: '系统管理员',
      content: '你好，有什么需要帮忙的吗？',
      messageType: 'TEXT',
      createdAt: '2025-05-19T18:00:00Z',
    },
    memberCount: 2,
    members: [{ userId: '2', nickname: '张三' }],
    pinned: false,
    createdAt: '2025-01-03T00:00:00Z',
    updatedAt: '2025-05-19T18:00:00Z',
  },
]

const MESSAGES = {
  '1': [
    { messageId: 'msg-1', conversationId: '1', senderId: '2', senderName: '张三', senderAvatar: '',
      messageType: 'TEXT', content: '大家好，欢迎使用企业IM', createdAt: '2025-05-20T10:30:00Z' },
    { messageId: 'msg-2', conversationId: '1', senderId: '5', senderName: '赵六', senderAvatar: '',
      messageType: 'TEXT', content: '大家好！', createdAt: '2025-05-20T10:31:00Z' },
    { messageId: 'msg-3', conversationId: '1', senderId: '1', senderName: '系统管理员', senderAvatar: '',
      messageType: 'TEXT', content: '欢迎欢迎', createdAt: '2025-05-20T10:32:00Z' },
  ],
  '2': [
    { messageId: 'msg-4', conversationId: '2', senderId: '3', senderName: '李四', senderAvatar: '',
      messageType: 'TEXT', content: '今天下午3点开会', createdAt: '2025-05-20T09:00:00Z' },
  ],
  '3': [
    { messageId: 'msg-5', conversationId: '3', senderId: '2', senderName: '张三', senderAvatar: '',
      messageType: 'TEXT', content: '管理员在吗？', createdAt: '2025-05-19T17:59:00Z' },
    { messageId: 'msg-6', conversationId: '3', senderId: '1', senderName: '系统管理员', senderAvatar: '',
      messageType: 'TEXT', content: '你好，有什么需要帮忙的吗？', createdAt: '2025-05-19T18:00:00Z' },
  ],
}

function matchUrl(pathname) {
  if (pathname === '/api/auth/login') return 'login'
  if (pathname === '/api/auth/logout') return 'logout'
  if (pathname === '/api/auth/refresh') return 'refresh'
  if (pathname === '/api/users/me') return 'profile'
  if (pathname === '/api/users/list') return 'userList'
  if (pathname === '/api/users/search') return 'userSearch'
  if (pathname === '/api/users/password') return 'password'
  if (pathname === '/api/users/profile') return 'updateProfile'
  if (pathname === '/api/depts/tree') return 'deptTree'
  if (pathname === '/api/admin/depts/tree') return 'deptTree'
  if (pathname === '/api/conversations') return 'conversations'
  if (pathname === '/api/messages/read') return 'messageRead'
  if (pathname === '/api/admin/users/page') return 'adminUserPage'
  if (pathname === '/api/admin/users') return 'adminUserCrud'
  if (pathname === '/api/admin/depts') return 'adminDeptCrud'
  if (pathname.startsWith('/api/messages/read/')) return 'messageRead'
  if (pathname.startsWith('/api/messages/')) return 'messages'
  if (pathname.startsWith('/api/files/download/')) return 'fileDownload'
  if (pathname.startsWith('/api/files/')) return 'fileUpload'
  if (pathname.startsWith('/api/conversations/') && pathname.endsWith('/pin')) return 'pinConversation'
  if (pathname.startsWith('/api/conversations/') && pathname.includes('/members')) return 'convMember'
  if (pathname.startsWith('/api/conversations/')) return 'singleConversation'
  if (pathname.startsWith('/api/admin/users/') && pathname.endsWith('/status')) return 'adminUserStatus'
  if (pathname.startsWith('/api/admin/users/')) return 'adminUserDelete'
  if (pathname.startsWith('/api/admin/depts/')) return 'adminDeptDelete'
  if (pathname.startsWith('/api/')) return 'notFound'
  return 'notFound'
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 204, '')
  }

  const url = new URL(req.url, 'http://localhost:8080')
  const route = matchUrl(url.pathname)

  console.log(`[${req.method}] ${url.pathname} -> ${route}`)

  switch (route) {
    case 'login': {
      const body = await parseBody(req)
      if (body.username === 'admin' && body.password === 'admin123') {
        return json(res, 200, {
          token: MOCK_TOKEN,
          user: ADMIN_USER,
        })
      }
      return json(res, 401, { message: '用户名或密码错误' })
    }

    case 'logout':
    case 'refresh':
      return json(res, 200, { ok: true })

    case 'profile':
      return json(res, 200, {
        userId: String(ADMIN_USER.id),
        username: ADMIN_USER.username,
        nickname: ADMIN_USER.nickname,
        avatar: ADMIN_USER.avatar,
        email: ADMIN_USER.email,
        phone: ADMIN_USER.phone,
        deptId: String(ADMIN_USER.deptId),
        deptName: ADMIN_USER.deptName,
        role: ADMIN_USER.role,
        status: String(ADMIN_USER.status),
        remark: '',
        createdAt: ADMIN_USER.createdAt,
      })

    case 'deptTree':
      return json(res, 200, DEPTS)

    case 'userList': {
      const deptId = url.searchParams.get('deptId')
      let list = USERS.filter(u => String(u.id) !== '1')
      if (deptId) {
        list = list.filter(u => String(u.deptId) === deptId)
      }
      return json(res, 200, list.map(u => ({
        userId: String(u.id),
        username: u.username,
        nickname: u.nickname,
        avatar: '',
        deptId: String(u.deptId),
        deptName: u.deptName,
      })))
    }

    case 'userSearch': {
      const keyword = (url.searchParams.get('keyword') || '').toLowerCase()
      let list = USERS.filter(u =>
        u.username.toLowerCase().includes(keyword) ||
        u.nickname.toLowerCase().includes(keyword)
      )
      return json(res, 200, list.map(u => ({
        userId: String(u.id),
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        avatar: '',
        deptId: String(u.deptId),
        deptName: u.deptName,
      })))
    }

    case 'password':
      return json(res, 200, { ok: true })

    case 'updateProfile':
      return json(res, 200, { ok: true })

    case 'conversations': {
      if (req.method === 'POST') {
        const body = await parseBody(req)
        const newId = String(CONVERSATIONS.length + 1)
        const newConv = {
          conversationId: newId,
          type: body.type || 'SINGLE',
          name: body.name || '新会话',
          avatar: '',
          lastMessage: null,
          memberCount: (body.memberIds || []).length + 1,
          members: (body.memberIds || []).map((id) => ({ userId: id })),
          pinned: false,
          createdAt: NOW,
          updatedAt: NOW,
        }
        CONVERSATIONS.push(newConv)
        return json(res, 200, newConv)
      }
      return json(res, 200, CONVERSATIONS)
    }

    case 'singleConversation': {
      const convId = url.pathname.split('/')[3]
      const conv = CONVERSATIONS.find(c => c.conversationId === convId)
      if (!conv) return json(res, 404, { message: '会话不存在' })
      return json(res, 200, conv)
    }

    case 'pinConversation': {
      const convId = url.pathname.split('/')[3]
      const pinned = url.searchParams.get('pinned') === 'true'
      const conv = CONVERSATIONS.find(c => c.conversationId === convId)
      if (conv) conv.pinned = pinned
      return json(res, 200, { ok: true })
    }

    case 'messages': {
      const convId = url.pathname.split('/')[3]
      const beforeId = url.searchParams.get('beforeId')
      let msgs = MESSAGES[convId] || []
      if (beforeId) {
        const idx = msgs.findIndex(m => m.messageId === beforeId)
        if (idx > 0) msgs = msgs.slice(0, idx)
        else msgs = []
      }
      return json(res, 200, msgs)
    }

    case 'messageRead':
      return json(res, 200, { ok: true })

    case 'convMember': {
      if (req.method === 'POST') {
        return json(res, 200, { ok: true })
      }
      return json(res, 200, { ok: true })
    }

    case 'adminUserPage': {
      const keyword = (url.searchParams.get('keyword') || '').toLowerCase()
      const status = url.searchParams.get('status')
      const page = parseInt(url.searchParams.get('page')) || 1
      const pageSize = parseInt(url.searchParams.get('pageSize')) || 10

      let filtered = USERS.filter(u => {
        if (keyword && !u.username.toLowerCase().includes(keyword) &&
          !u.nickname.toLowerCase().includes(keyword) &&
          !u.email.toLowerCase().includes(keyword)) return false
        if (status !== null && status !== undefined && status !== '' &&
          u.status !== parseInt(status)) return false
        return true
      })

      return json(res, 200, {
        records: filtered,
        total: filtered.length,
        size: pageSize,
        current: page,
        pages: Math.ceil(filtered.length / pageSize),
      })
    }

    case 'adminUserCrud': {
      if (req.method === 'POST') {
        return json(res, 200, { ok: true })
      }
      if (req.method === 'PUT') {
        return json(res, 200, { ok: true })
      }
      return json(res, 200, { ok: true })
    }

    case 'adminUserDelete': {
      return json(res, 200, { ok: true })
    }

    case 'adminUserStatus': {
      return json(res, 200, { ok: true })
    }

    case 'adminDeptCrud': {
      if (req.method === 'POST') {
        return json(res, 200, { ok: true })
      }
      if (req.method === 'PUT') {
        return json(res, 200, { ok: true })
      }
      return json(res, 200, { ok: true })
    }

    case 'adminDeptDelete': {
      return json(res, 200, { ok: true })
    }

    case 'fileUpload': {
      return json(res, 200, {
        fileId: 'mock-file-id-001',
        url: 'http://localhost:8080/api/files/download/mock-file-id-001',
      })
    }

    case 'fileDownload':
      return json(res, 200, { ok: true })

    case 'notFound':
    default:
      return json(res, 200, { message: 'Mock API not implemented: ' + url.pathname })
  }
})

server.listen(8080, () => {
  console.log('Mock API server running at http://localhost:8080')
  console.log('Default admin account: admin / admin123')
})
