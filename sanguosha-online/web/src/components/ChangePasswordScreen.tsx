import { Alert, Button, Form, Input, Modal, Space } from 'antd';
import { Brand } from './Brand';

export interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface PasswordFormProps {
  loading: boolean;
  error?: string;
  submitText: string;
  onSubmit: (values: Pick<ChangePasswordValues, 'currentPassword' | 'newPassword'>) => Promise<void>;
}

function PasswordForm({ loading, error, submitText, onSubmit }: PasswordFormProps) {
  return (
    <>
      {error && <Alert className="login-alert" type="error" showIcon message={error} />}
      <Form<ChangePasswordValues>
        layout="vertical"
        requiredMark={false}
        size="large"
        onFinish={(values) => onSubmit({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        })}
      >
        <Form.Item
          label="当前密码"
          name="currentPassword"
          rules={[{ required: true, message: '请输入当前密码' }]}
        >
          <Input.Password autoComplete="current-password" placeholder="请输入管理员分配的初始密码" autoFocus />
        </Form.Item>
        <Form.Item
          label="新密码"
          name="newPassword"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 8, message: '新密码至少 8 位' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || value !== getFieldValue('currentPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('新密码不能与当前密码相同'));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="至少 8 位" />
        </Form.Item>
        <Form.Item
          label="确认新密码"
          name="confirmPassword"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="再次输入新密码" />
        </Form.Item>
        <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={loading}>
          {submitText}
        </Button>
      </Form>
    </>
  );
}

interface RequiredPasswordChangeScreenProps {
  displayName: string;
  loading: boolean;
  error?: string;
  onChangePassword: PasswordFormProps['onSubmit'];
  onLogout: () => void;
}

export function RequiredPasswordChangeScreen({
  displayName,
  loading,
  error,
  onChangePassword,
  onLogout,
}: RequiredPasswordChangeScreenProps) {
  return (
    <main className="login-page password-change-page">
      <section className="login-intro" aria-labelledby="password-change-title">
        <div className="login-intro__content">
          <Brand />
          <p className="login-eyebrow">Account security</p>
          <h1 id="password-change-title">更新访问凭据。</h1>
          <p className="login-description">
            {displayName}，当前使用的是管理员分配或重置的临时密码。完成修改前，工作区不会开放。
          </p>
        </div>
      </section>

      <section className="login-panel" aria-label="修改初始密码">
        <div className="paper-card login-card password-change-card">
          <div className="login-card__heading">
            <span className="section-kicker">Required action</span>
            <h2>设置你的新密码</h2>
            <p>新密码仅由你掌握，管理员和页面都不会显示或保存明文。</p>
          </div>
          <Alert
            className="login-alert"
            type="warning"
            showIcon
            message="完成改密后会自动进入工作区"
          />
          <PasswordForm loading={loading} error={error} submitText="保存并进入工作区" onSubmit={onChangePassword} />
          <Space className="password-change-actions">
            <Button type="link" onClick={onLogout}>退出当前账号</Button>
          </Space>
        </div>
      </section>
    </main>
  );
}

interface ChangePasswordModalProps {
  open: boolean;
  loading: boolean;
  error?: string;
  onClose: () => void;
  onChangePassword: PasswordFormProps['onSubmit'];
}

export function ChangePasswordModal({
  open,
  loading,
  error,
  onClose,
  onChangePassword,
}: ChangePasswordModalProps) {
  return (
    <Modal
      title="修改登录密码"
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnClose
      maskClosable={!loading}
      closable={!loading}
    >
      <p>修改后，其他设备上的旧登录状态会失效。</p>
      <PasswordForm loading={loading} error={error} submitText="确认修改" onSubmit={onChangePassword} />
    </Modal>
  );
}
