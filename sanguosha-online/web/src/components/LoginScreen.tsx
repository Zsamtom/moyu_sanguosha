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
          <p className="login-eyebrow">谋略 · 判断 · 配合</p>
          <h1 id="login-title">一席纸上风云，<br />等你入局。</h1>
          <p className="login-description">
            创建房间，邀请同伴，在实时文字战报中体验身份推理与卡牌博弈。
          </p>
          <div className="login-features" aria-label="游戏特点">
            <span>多人实时房间</span>
            <span>服务端规则裁定</span>
            <span>账号由管理员分配</span>
          </div>
        </div>
        <div className="ink-orbit" aria-hidden="true">
          <span>魏</span><span>蜀</span><span>吴</span><span>群</span>
        </div>
      </section>

      <section className="login-panel" aria-label="登录">
        <div className="paper-card login-card">
          <div className="login-card__heading">
            <span className="section-kicker">欢迎归席</span>
            <h2>登录账号</h2>
            <p>本站不开放自助注册，请使用管理员分配的账号。</p>
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
              入局
            </Button>
          </Form>
          <p className="login-help">若忘记密码，请联系管理员重置。</p>
        </div>
      </section>
    </main>
  );
}
