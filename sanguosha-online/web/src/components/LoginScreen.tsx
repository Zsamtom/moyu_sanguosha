import { Alert, Button, Form, Input } from 'antd';
import { Brand } from './Brand';

interface LoginValues {
  username: string;
  password: string;
}

interface LoginScreenProps {
  loading: boolean;
  error?: string;
  onLogin: (values: LoginValues) => Promise<void>;
}

export function LoginScreen({ loading, error, onLogin }: LoginScreenProps) {
  return (
    <main className="login-page">
      <section className="login-intro" aria-labelledby="login-title">
        <div className="login-intro__content">
          <Brand />
          <p className="login-eyebrow">Internal workspace</p>
          <h1 id="login-title">项目文档与<br />实时协作。</h1>
          <p className="login-description">
            面向受邀成员的内部工作区。房间状态、操作记录与规则结算由服务器统一同步。
          </p>
          <div className="login-features" aria-label="游戏特点">
            <span>实时状态同步</span>
            <span>服务端一致性</span>
            <span>管理员账号分配</span>
          </div>
        </div>
        <div className="ink-orbit" aria-hidden="true">
          <span>魏</span><span>蜀</span><span>吴</span><span>群</span>
        </div>
      </section>

      <section className="login-panel" aria-label="登录">
        <div className="paper-card login-card">
          <div className="login-card__heading">
            <span className="section-kicker">Private access</span>
            <h2>访问工作区</h2>
            <p>不开放自助注册，请使用管理员分配的账号。</p>
          </div>
          {error && <Alert className="login-alert" type="error" showIcon message={error} />}
          <Form<LoginValues>
            layout="vertical"
            requiredMark={false}
            size="large"
            onFinish={onLogin}
            initialValues={{ username: '' }}
          >
            <Form.Item
              label="账号"
              name="username"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input autoComplete="username" placeholder="请输入管理员分配的账号" autoFocus />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password autoComplete="current-password" placeholder="请输入密码" />
            </Form.Item>
            <Button className="primary-ink-button" type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form>
          <p className="login-help">若忘记密码，请联系管理员重置。</p>
        </div>
      </section>
    </main>
  );
}
