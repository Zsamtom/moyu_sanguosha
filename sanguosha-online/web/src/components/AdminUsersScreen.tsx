import { Button, Form, Input, Modal, Popconfirm, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import type { AuthUser } from '../types';

interface CreateUserValues {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

interface ResetPasswordValues {
  password: string;
  confirmPassword: string;
}

interface AdminUsersScreenProps {
  currentUser: AuthUser;
  users: AuthUser[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreate: (values: Pick<CreateUserValues, 'username' | 'displayName' | 'password'>) => Promise<void>;
  onStatus: (userId: string, disabled: boolean) => Promise<void>;
  onResetPassword: (userId: string, password: string) => Promise<void>;
}

export function AdminUsersScreen({
  currentUser,
  users,
  loading,
  onRefresh,
  onCreate,
  onStatus,
  onResetPassword,
}: AdminUsersScreenProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AuthUser>();
  const [submitting, setSubmitting] = useState(false);
  const [statusUserId, setStatusUserId] = useState<string>();
  const [createForm] = Form.useForm<CreateUserValues>();
  const [resetForm] = Form.useForm<ResetPasswordValues>();

  const closeCreate = () => {
    createForm.resetFields();
    setCreateOpen(false);
  };

  const closeReset = () => {
    resetForm.resetFields();
    setResetTarget(undefined);
  };

  useEffect(() => {
    void onRefresh();
  }, [onRefresh]);

  const createUser = async (values: CreateUserValues) => {
    setSubmitting(true);
    try {
      await onCreate({
        username: values.username.trim(),
        displayName: values.displayName.trim(),
        password: values.password,
      });
      createForm.resetFields();
      setCreateOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const resetPassword = async (values: ResetPasswordValues) => {
    if (!resetTarget) return;
    setSubmitting(true);
    try {
      await onResetPassword(resetTarget.id, values.password);
      closeReset();
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (user: AuthUser) => {
    setStatusUserId(user.id);
    try {
      await onStatus(user.id, !user.disabled);
    } finally {
      setStatusUserId(undefined);
    }
  };

  const columns: ColumnsType<AuthUser> = [
    {
      title: '玩家',
      key: 'player',
      render: (_, user) => (
        <div className="user-cell">
          <span className="user-monogram">{user.displayName.slice(0, 1)}</span>
          <span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
        </div>
      ),
    },
    {
      title: '权限',
      dataIndex: 'role',
      width: 110,
      responsive: ['sm'],
      render: (role: AuthUser['role']) => role === 'admin' ? <Tag color="gold">管理员</Tag> : <Tag>玩家</Tag>,
    },
    {
      title: '状态',
      width: 150,
      render: (_, user) => user.disabled
        ? <Tag color="red">已停用</Tag>
        : user.mustChangePassword
          ? <Tag color="orange">待首次改密</Tag>
          : <Tag color="green">可进入大厅</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      responsive: ['lg'],
      render: (createdAt?: string) => createdAt ? new Date(createdAt).toLocaleString('zh-CN', { hour12: false }) : '—',
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, user) => (
        <Space wrap>
          <Button size="small" onClick={() => setResetTarget(user)}>重置密码</Button>
          <Popconfirm
            title={user.disabled ? '启用此账号？' : '停用此账号？'}
            description={user.disabled ? '启用后玩家可重新登录。' : '停用后玩家将无法登录。'}
            onConfirm={() => void changeStatus(user)}
            disabled={user.id === currentUser.id}
          >
            <Button
              size="small"
              danger={!user.disabled}
              disabled={user.id === currentUser.id}
              loading={statusUserId === user.id}
            >
              {user.disabled ? '启用' : '停用'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const passwordRules = [
    { required: true, message: '请输入密码' },
    { min: 8, message: '密码至少 8 位' },
  ];

  return (
    <main className="page admin-page">
      <section className="page-title-row">
        <div>
          <span className="section-kicker">Admin</span>
          <h1>账号管理</h1>
          <p>创建玩家账号、重置密码，并控制账号登录权限。</p>
        </div>
        <Button className="primary-ink-button" type="primary" size="large" onClick={() => setCreateOpen(true)}>
          分配新账号
        </Button>
      </section>

      <section className="admin-stats">
        <div className="paper-card"><span>账号总数</span><strong>{users.length}</strong></div>
        <div className="paper-card"><span>正常账号</span><strong>{users.filter((user) => !user.disabled).length}</strong></div>
        <div className="paper-card"><span>待改密</span><strong>{users.filter((user) => !user.disabled && user.mustChangePassword).length}</strong></div>
        <div className="paper-card"><span>已停用</span><strong>{users.filter((user) => user.disabled).length}</strong></div>
      </section>

      <section className="paper-card user-table-section">
        <div className="section-toolbar">
          <div><h2>账号列表</h2><p>玩家不能自行注册，账号仅由管理员在此创建。</p></div>
          <Button loading={loading} onClick={() => void onRefresh()}>刷新</Button>
        </div>
        <Table<AuthUser>
          rowKey="id"
          columns={columns}
          dataSource={users}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 个账号` }}
          scroll={{ x: 720 }}
        />
      </section>

      <Modal title="分配新账号" open={createOpen} onCancel={closeCreate} footer={null} destroyOnClose>
        <Form<CreateUserValues>
          form={createForm}
          layout="vertical"
          requiredMark={false}
          onFinish={createUser}
        >
          <Form.Item
            label="登录账号"
            name="username"
            extra="建议使用小写字母、数字或下划线"
            rules={[
              { required: true, message: '请输入登录账号' },
              { pattern: /^[a-zA-Z0-9_.-]{3,24}$/, message: '请输入 3—24 位字母、数字、点、下划线或连字符' },
            ]}
          >
            <Input autoComplete="off" placeholder="例如：liubei_01" />
          </Form.Item>
          <Form.Item label="显示名称" name="displayName" rules={[{ required: true, message: '请输入显示名称' }, { max: 16 }] }>
            <Input placeholder="例如：玄德" maxLength={16} showCount />
          </Form.Item>
          <Form.Item label="初始密码" name="password" rules={passwordRules}>
            <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            label="确认密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="再次输入初始密码" />
          </Form.Item>
          <p className="form-note">安全策略：玩家首次登录必须修改该临时密码。</p>
          <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={submitting}>创建账号</Button>
        </Form>
      </Modal>

      <Modal
        title={`重置密码${resetTarget ? ` · ${resetTarget.displayName}` : ''}`}
        open={Boolean(resetTarget)}
        onCancel={closeReset}
        footer={null}
        destroyOnClose
      >
        <Form<ResetPasswordValues>
          form={resetForm}
          layout="vertical"
          requiredMark={false}
          onFinish={resetPassword}
        >
          <Form.Item label="新密码" name="password" rules={passwordRules}>
            <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
          </Form.Item>
          <Form.Item
            label="确认新密码"
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="再次输入新密码" />
          </Form.Item>
          <p className="form-note">安全策略：重置后，玩家下次登录必须修改该临时密码。</p>
          <Button type="primary" htmlType="submit" block loading={submitting}>确认重置</Button>
        </Form>
      </Modal>
    </main>
  );
}
