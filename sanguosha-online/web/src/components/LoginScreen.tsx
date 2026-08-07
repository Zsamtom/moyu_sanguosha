import { Alert, Button, Form, Input } from 'antd';
import { useState } from 'react';
import { Brand } from './Brand';

export interface LoginValues {
  username: string;
  password: string;
}

export interface RegistrationValues {
  invitationCode: string;
  username: string;
  displayName?: string;
  password: string;
  confirmPassword: string;
}

interface LoginScreenProps {
  loading: boolean;
  error?: string;
  onLogin: (values: LoginValues) => Promise<void>;
  onRegister: (values: Omit<RegistrationValues, 'confirmPassword'>) => Promise<void>;
  onModeChange?: () => void;
}

const usernameRules = [
  { required: true, message: '请输入账号' },
  { min: 3, message: '账号至少 3 位' },
  { max: 32, message: '账号最多 32 位' },
  { pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]*$/, message: '仅支持字母、数字、点、下划线和连字符' },
];

export function LoginScreen({ loading, error, onLogin, onRegister, onModeChange }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const registering = mode === 'register';

  const changeMode = (nextMode: 'login' | 'register') => {
    if (nextMode === mode) return;
    setMode(nextMode);
    onModeChange?.();
  };

  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-intro__content">
          <Brand />
          <p className="login-eyebrow">Games &amp; utilities</p>
          <h1 id="login-title">游戏与功能，<br />都在墨鱼。</h1>
          <p className="login-description">
            面向受邀成员的私人工作区。多人游戏由服务器统一同步，实用功能保留在你的浏览器中。
          </p>
          <div className="login-features" aria-label="网站功能">
            <span>三国杀与够级</span>
            <span>TXT 小说阅读</span>
            <span>私人账号访问</span>
          </div>
        </div>
        <div className="ink-orbit" aria-hidden="true">
          <span>魏</span><span>蜀</span><span>吴</span><span>群</span>
        </div>
      </section>

      <section className="login-panel" aria-label={registering ? '注册' : '登录'}>
        <div className="paper-card login-card">
          <div className="login-card__heading">
            <span className="section-kicker">Private access</span>
            <h2>{registering ? '创建账号' : '访问工作区'}</h2>
            <p>{registering ? '输入邀请码后即可创建个人账号。' : '使用已有账号登录，或使用邀请码创建新账号。'}</p>
          </div>
          {error && <Alert className="login-alert" type="error" showIcon message={error} />}
          {registering ? (
            <Form<RegistrationValues>
              key="register"
              layout="vertical"
              requiredMark={false}
              size="large"
              onFinish={(values) => onRegister({
                invitationCode: values.invitationCode,
                username: values.username,
                displayName: values.displayName,
                password: values.password,
              })}
            >
              <Form.Item label="邀请码" name="invitationCode" rules={[{ required: true, message: '请输入邀请码' }]}>
                <Input autoComplete="off" placeholder="请输入邀请码" autoFocus />
              </Form.Item>
              <Form.Item label="账号" name="username" rules={usernameRules}>
                <Input autoComplete="username" placeholder="3–32 位，字母、数字、点、下划线或连字符" />
              </Form.Item>
              <Form.Item label="昵称（可选）" name="displayName" rules={[{ max: 40, message: '昵称最多 40 位' }]}>
                <Input autoComplete="nickname" placeholder="默认使用账号名" />
              </Form.Item>
              <Form.Item
                label="密码"
                name="password"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 8, message: '密码至少 8 位' },
                  { max: 128, message: '密码最多 128 位' },
                  { whitespace: true, message: '密码不能只包含空白字符' },
                ]}
              >
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
                      return !value || value === getFieldValue('password')
                        ? Promise.resolve()
                        : Promise.reject(new Error('两次密码不一致'));
                    },
                  }),
                ]}
              >
                <Input.Password autoComplete="new-password" placeholder="再次输入密码" />
              </Form.Item>
              <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={loading}>
                创建并登录
              </Button>
            </Form>
          ) : (
            <Form<LoginValues>
              key="login"
              layout="vertical"
              requiredMark={false}
              size="large"
              onFinish={onLogin}
              initialValues={{ username: '' }}
            >
              <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }]}>
                <Input autoComplete="username" placeholder="请输入账号" autoFocus />
              </Form.Item>
              <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password autoComplete="current-password" placeholder="请输入密码" />
              </Form.Item>
              <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={loading}>
                登录
              </Button>
            </Form>
          )}
          <div className="login-mode-switch">
            <span>{registering ? '已有账号？' : '首次访问？'}</span>
            <Button type="link" onClick={() => changeMode(registering ? 'login' : 'register')} disabled={loading}>
              {registering ? '返回登录' : '使用邀请码注册'}
            </Button>
          </div>
          {!registering && <p className="login-help">若忘记密码，请联系管理员重置。</p>}
        </div>
      </section>
    </main>
  );
}
