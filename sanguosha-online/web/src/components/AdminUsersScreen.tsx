import { AutoComplete, Button, Form, Input, InputNumber, Modal, Popconfirm, Space, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import type {
  AuthUser,
  DeepSeekModel,
  LlmDecisionAuditEntry,
  LlmGovernanceSnapshot,
  LlmSettings,
  TownWeatherSettings,
  UpdateLlmSettings,
  UpdateTownWeatherSettings,
} from '../types';

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

interface DisplayNameValues {
  displayName: string;
}

interface LlmSettingsValues extends Omit<UpdateLlmSettings, 'clearApiKey'> {
  apiKey?: string;
}

interface TownWeatherSettingsValues
  extends Omit<UpdateTownWeatherSettings, 'clearApiKey'> {
  apiKey?: string;
}

interface AdminUsersScreenProps {
  currentUser: AuthUser;
  users: AuthUser[];
  loading: boolean;
  llmSettings?: LlmSettings;
  llmSettingsLoading: boolean;
  townWeatherSettings?: TownWeatherSettings;
  townWeatherSettingsLoading: boolean;
  llmUsage?: LlmGovernanceSnapshot;
  llmUsageLoading: boolean;
  onRefresh: () => Promise<void>;
  onRefreshLlmSettings: () => Promise<void>;
  onRefreshTownWeatherSettings: () => Promise<void>;
  onRefreshLlmUsage: () => Promise<void>;
  onSaveLlmSettings: (values: UpdateLlmSettings) => Promise<void>;
  onTestLlmConnection: (apiKey?: string, model?: DeepSeekModel) => Promise<void>;
  onSaveTownWeatherSettings: (values: UpdateTownWeatherSettings) => Promise<void>;
  onTestTownWeatherConnection: (
    values: Partial<
      Omit<UpdateTownWeatherSettings, 'enabled' | 'clearApiKey'>
    >,
  ) => Promise<void>;
  onCreate: (values: Pick<CreateUserValues, 'username' | 'displayName' | 'password'>) => Promise<void>;
  onDisplayName: (userId: string, displayName: string) => Promise<void>;
  onStatus: (userId: string, disabled: boolean) => Promise<void>;
  onResetPassword: (userId: string, password: string) => Promise<void>;
  onDelete: (userId: string) => Promise<void>;
}

export const LLM_AUDIT_PAGE_SIZE = 10;

export function clampLlmAuditCurrentPage(
  current: number,
  total: number,
  pageSize = LLM_AUDIT_PAGE_SIZE,
) {
  return Math.min(
    Math.max(1, current),
    Math.max(1, Math.ceil(total / pageSize)),
  );
}

export function AdminUsersScreen({
  currentUser,
  users,
  loading,
  llmSettings,
  llmSettingsLoading,
  townWeatherSettings,
  townWeatherSettingsLoading,
  llmUsage,
  llmUsageLoading,
  onRefresh,
  onRefreshLlmSettings,
  onRefreshTownWeatherSettings,
  onRefreshLlmUsage,
  onSaveLlmSettings,
  onTestLlmConnection,
  onSaveTownWeatherSettings,
  onTestTownWeatherConnection,
  onCreate,
  onDisplayName,
  onStatus,
  onResetPassword,
  onDelete,
}: AdminUsersScreenProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState<AuthUser>();
  const [displayNameTarget, setDisplayNameTarget] = useState<AuthUser>();
  const [submitting, setSubmitting] = useState(false);
  const [statusUserId, setStatusUserId] = useState<string>();
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmTesting, setLlmTesting] = useState(false);
  const [weatherSaving, setWeatherSaving] = useState(false);
  const [weatherTesting, setWeatherTesting] = useState(false);
  const [llmAuditCurrentPage, setLlmAuditCurrentPage] = useState(1);
  const [createForm] = Form.useForm<CreateUserValues>();
  const [resetForm] = Form.useForm<ResetPasswordValues>();
  const [displayNameForm] = Form.useForm<DisplayNameValues>();
  const [llmForm] = Form.useForm<LlmSettingsValues>();
  const [weatherForm] = Form.useForm<TownWeatherSettingsValues>();
  const pendingLlmApiKey = Form.useWatch('apiKey', llmForm);
  const pendingWeatherApiKey = Form.useWatch('apiKey', weatherForm);
  const llmAuditTotal = llmUsage?.recent.length ?? 0;
  const llmAuditCurrent = clampLlmAuditCurrentPage(
    llmAuditCurrentPage,
    llmAuditTotal,
  );

  const closeCreate = () => {
    createForm.resetFields();
    setCreateOpen(false);
  };

  const closeReset = () => {
    resetForm.resetFields();
    setResetTarget(undefined);
  };

  const closeDisplayName = () => {
    displayNameForm.resetFields();
    setDisplayNameTarget(undefined);
  };

  useEffect(() => {
    void onRefresh();
    void onRefreshLlmSettings();
    void onRefreshTownWeatherSettings();
    void onRefreshLlmUsage();
  }, [
    onRefresh,
    onRefreshLlmSettings,
    onRefreshLlmUsage,
    onRefreshTownWeatherSettings,
  ]);

  useEffect(() => {
    if (!llmSettings) return;
    llmForm.setFieldsValue({
      enabled: llmSettings.enabled,
      model: llmSettings.model,
      apiKey: undefined,
      thinkingEnabled: llmSettings.thinkingEnabled,
      timeoutMs: llmSettings.timeoutMs,
      maximumOutputTokens: llmSettings.maximumOutputTokens,
    });
  }, [llmForm, llmSettings]);

  useEffect(() => {
    if (!townWeatherSettings) return;
    weatherForm.setFieldsValue({
      enabled: townWeatherSettings.enabled,
      apiHost: townWeatherSettings.apiHost,
      apiKey: undefined,
      timeoutMs: townWeatherSettings.timeoutMs,
      forecastDays: townWeatherSettings.forecastDays,
      towns: townWeatherSettings.towns,
    });
  }, [townWeatherSettings, weatherForm]);

  useEffect(() => {
    setLlmAuditCurrentPage((current) =>
      clampLlmAuditCurrentPage(current, llmAuditTotal),
    );
  }, [llmAuditTotal]);

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

  const changeDisplayName = async (values: DisplayNameValues) => {
    if (!displayNameTarget) return;
    setSubmitting(true);
    try {
      await onDisplayName(displayNameTarget.id, values.displayName.trim());
      closeDisplayName();
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

  const saveLlmSettings = async (values: LlmSettingsValues) => {
    setLlmSaving(true);
    try {
      await onSaveLlmSettings({
        ...values,
        ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
      });
      llmForm.setFieldValue('apiKey', undefined);
    } finally {
      setLlmSaving(false);
    }
  };

  const clearLlmApiKey = async () => {
    if (!llmSettings) return;
    setLlmSaving(true);
    try {
      await onSaveLlmSettings({
        enabled: false,
        model: llmSettings.model,
        clearApiKey: true,
        thinkingEnabled: llmSettings.thinkingEnabled,
        timeoutMs: llmSettings.timeoutMs,
        maximumOutputTokens: llmSettings.maximumOutputTokens,
      });
      llmForm.setFieldsValue({ enabled: false, apiKey: undefined });
    } finally {
      setLlmSaving(false);
    }
  };

  const testLlmConnection = async () => {
    setLlmTesting(true);
    try {
      await onTestLlmConnection(
        llmForm.getFieldValue('apiKey'),
        llmForm.getFieldValue('model'),
      );
    } finally {
      setLlmTesting(false);
    }
  };

  const saveTownWeatherSettings = async (
    values: TownWeatherSettingsValues,
  ) => {
    setWeatherSaving(true);
    try {
      await onSaveTownWeatherSettings({
        ...values,
        ...(values.apiKey?.trim() ? { apiKey: values.apiKey.trim() } : {}),
      });
      weatherForm.setFieldValue('apiKey', undefined);
    } finally {
      setWeatherSaving(false);
    }
  };

  const clearTownWeatherApiKey = async () => {
    if (!townWeatherSettings) return;
    setWeatherSaving(true);
    try {
      await onSaveTownWeatherSettings({
        enabled: false,
        apiHost: townWeatherSettings.apiHost,
        clearApiKey: true,
        timeoutMs: townWeatherSettings.timeoutMs,
        forecastDays: townWeatherSettings.forecastDays,
        towns: townWeatherSettings.towns,
      });
      weatherForm.setFieldsValue({ enabled: false, apiKey: undefined });
    } finally {
      setWeatherSaving(false);
    }
  };

  const testTownWeatherConnection = async () => {
    setWeatherTesting(true);
    try {
      const values = weatherForm.getFieldsValue();
      await onTestTownWeatherConnection({
        apiHost: values.apiHost,
        apiKey: values.apiKey,
        timeoutMs: values.timeoutMs,
        forecastDays: values.forecastDays,
        towns: values.towns,
      });
    } finally {
      setWeatherTesting(false);
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
      width: 330,
      render: (_, user) => (
        <Space wrap>
          <Button size="small" onClick={() => {
            setDisplayNameTarget(user);
            displayNameForm.setFieldsValue({ displayName: user.displayName });
          }}>修改昵称</Button>
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
          <Popconfirm
            title="永久删除此账号？"
            description="账号将退出当前房间，且无法恢复。"
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDelete(user.id)}
            disabled={user.id === currentUser.id}
          >
            <Button size="small" danger disabled={user.id === currentUser.id}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const llmAuditColumns: ColumnsType<LlmDecisionAuditEntry> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (createdAt: string) =>
        new Date(createdAt).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '玩家',
      dataIndex: 'userId',
      width: 150,
      render: (userId: string | null) =>
        users.find((candidate) => candidate.id === userId)?.displayName ??
          userId?.slice(0, 8) ??
          '已删除账号',
    },
    {
      title: '结果',
      dataIndex: 'status',
      width: 100,
      render: (status: LlmDecisionAuditEntry['status']) => {
        const labels = {
          success: ['成功', 'green'],
          fallback: ['已回退', 'orange'],
          failure: ['失败', 'red'],
          skipped: ['已拦截', 'default'],
        } as const;
        const [label, color] = labels[status];
        return <Tag color={color}>{label}</Tag>;
      },
    },
    {
      title: '事件',
      dataIndex: 'selectedEventId',
      width: 180,
      render: (eventId: string | null) => eventId ?? '—',
    },
    {
      title: 'Token',
      width: 120,
      render: (_, entry) =>
        `${entry.promptTokens + entry.completionTokens}`,
    },
    {
      title: '耗时',
      dataIndex: 'latencyMs',
      width: 100,
      render: (latencyMs: number) => `${latencyMs} ms`,
    },
    {
      title: '原因',
      dataIndex: 'failureReason',
      width: 180,
      render: (reason: string | null) => reason ?? '—',
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

      <section className="paper-card llm-settings-section">
        <div className="section-toolbar">
          <div>
            <h2>大模型机器人</h2>
            <p>当前用于三国杀、斗地主、农场行情与庄园经营管家；够级继续使用原有规则机器人。</p>
          </div>
          <Space>
            <Tag color={llmSettings?.enabled ? 'green' : 'default'}>
              {llmSettings?.enabled ? '运行中' : '未启用'}
            </Tag>
            <Button loading={llmSettingsLoading} onClick={() => void onRefreshLlmSettings()}>刷新</Button>
          </Space>
        </div>

        <Form<LlmSettingsValues>
          className="llm-settings-form"
          form={llmForm}
          layout="vertical"
          requiredMark={false}
          disabled={!llmSettings || llmSettingsLoading}
          onFinish={saveLlmSettings}
        >
          <div className="llm-settings-grid">
            <Form.Item label="供应商">
              <Input value="DeepSeek" readOnly />
            </Form.Item>
            <Form.Item label="接口地址">
              <Input value={llmSettings?.endpoint ?? 'https://api.deepseek.com/chat/completions'} readOnly />
            </Form.Item>
            <Form.Item label="模型" name="model" rules={[{ required: true }]}>
              <AutoComplete
                options={[
                  { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（默认）' },
                  { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
                ]}
                placeholder="输入 DeepSeek 模型 ID"
              />
            </Form.Item>
            <Form.Item
              label="DeepSeek API Key"
              name="apiKey"
              extra={llmSettings?.apiKeyConfigured ? '已配置；留空将保留现有密钥' : '尚未配置'}
            >
              <Input.Password autoComplete="new-password" placeholder="sk-••••••••" />
            </Form.Item>
            <Form.Item
              label="单次最大输出 Token"
              name="maximumOutputTokens"
              rules={[{ required: true }]}
              extra="默认 4000，为思考模式预留；最终动作仍只接收一个候选序号。"
            >
              <InputNumber min={8} max={4_000} step={100} />
            </Form.Item>
            <Form.Item label="请求超时（毫秒）" name="timeoutMs" rules={[{ required: true }]}>
              <InputNumber min={500} max={30_000} step={500} />
            </Form.Item>
            <Form.Item
              label="思考模式"
              name="thinkingEnabled"
              valuePropName="checked"
              extra="关闭更省 Token；仅在确有必要时开启"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>
          </div>
          <div className="llm-settings-actions">
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="已启用" unCheckedChildren="未启用" />
            </Form.Item>
            <span>允许牌局机器人、斗地主真人建议、农场行情和庄园管家使用大模型；调用失败会回退规则策略。</span>
            <Space>
              {llmSettings?.apiKeyConfigured && (
                <Popconfirm
                  title="清除已保存的 API Key？"
                  description="大模型机器人会同时停用。"
                  okText="清除"
                  cancelText="取消"
                  onConfirm={() => void clearLlmApiKey()}
                >
                  <Button danger disabled={llmSaving}>清除密钥</Button>
                </Popconfirm>
              )}
              <Button
                loading={llmTesting}
                disabled={
                  llmSaving ||
                  (!llmSettings?.apiKeyConfigured && !pendingLlmApiKey?.trim())
                }
                onClick={() => void testLlmConnection()}
              >
                测试连接
              </Button>
              <Button type="primary" htmlType="submit" loading={llmSaving}>保存大模型配置</Button>
            </Space>
          </div>
        </Form>
      </section>

      <section className="paper-card llm-settings-section weather-settings-section">
        <div className="section-toolbar">
          <div>
            <h2>庄园真实天气与逐日预报</h2>
            <p>和风天气 API Key、专属 Host、请求参数与两座可玩城镇坐标均可热更新，无需重启。</p>
          </div>
          <Space>
            <Tag color={townWeatherSettings?.enabled ? 'green' : 'default'}>
              {townWeatherSettings?.enabled ? '实时同步中' : '安全回退模式'}
            </Tag>
            <Button
              loading={townWeatherSettingsLoading}
              onClick={() => void onRefreshTownWeatherSettings()}
            >
              刷新
            </Button>
          </Space>
        </div>

        <Form<TownWeatherSettingsValues>
          className="llm-settings-form"
          form={weatherForm}
          layout="vertical"
          requiredMark={false}
          disabled={!townWeatherSettings || townWeatherSettingsLoading}
          onFinish={saveTownWeatherSettings}
        >
          <div className="llm-settings-grid">
            <Form.Item
              label="和风天气专属 API Host"
              name="apiHost"
              extra="控制台中的专属 HTTPS *.qweatherapi.com 域名，不要填写接口路径"
            >
              <Input placeholder="https://abc123.qweatherapi.com" />
            </Form.Item>
            <Form.Item
              label="和风天气 API Key"
              name="apiKey"
              extra={townWeatherSettings?.apiKeyConfigured ? '已加密保存；留空保留现有密钥' : '尚未配置'}
            >
              <Input.Password autoComplete="new-password" placeholder="X-QW-Api-Key" />
            </Form.Item>
            <Form.Item
              label="逐日预报天数"
              name="forecastDays"
              rules={[{ required: true }]}
              extra="官方接口支持 1–10 天；庄园仅把未来数据用于规划，不提前改变结算"
            >
              <InputNumber min={1} max={10} />
            </Form.Item>
            <Form.Item
              label="单接口超时（毫秒）"
              name="timeoutMs"
              rules={[{ required: true }]}
            >
              <InputNumber min={500} max={10_000} step={500} />
            </Form.Item>
          </div>

          <div className="llm-settings-grid weather-location-grid">
            {([
              ['greenvale', '青禾镇', '郑州'],
              ['frostpeak', '霜岭镇', '拉萨'],
            ] as const).map(([townId, townName, defaultCity]) => (
              <div className="weather-location-card" key={townId}>
                <strong>{townName}天气锚点</strong>
                <Form.Item
                  label="现实城市"
                  name={['towns', townId, 'realCityName']}
                  rules={[{ required: true, message: `请输入${townName}对应城市` }]}
                >
                  <Input placeholder={defaultCity} />
                </Form.Item>
                <Space align="start" wrap>
                  <Form.Item
                    label="纬度"
                    name={['towns', townId, 'latitude']}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={-90} max={90} precision={2} />
                  </Form.Item>
                  <Form.Item
                    label="经度"
                    name={['towns', townId, 'longitude']}
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={-180} max={180} precision={2} />
                  </Form.Item>
                </Space>
              </div>
            ))}
          </div>

          <div className="llm-settings-actions">
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="已启用" unCheckedChildren="未启用" />
            </Form.Item>
            <span>实况用于当前 8 小时生产快照；逐日预报供气象站与庄园 LLM 规划。接口异常时自动回退，不应用伪造倍率。</span>
            <Space wrap>
              {townWeatherSettings?.apiKeyConfigured && (
                <Popconfirm
                  title="清除已保存的天气 API Key？"
                  description="真实天气会停用，庄园进入中性安全回退。"
                  okText="清除"
                  cancelText="取消"
                  onConfirm={() => void clearTownWeatherApiKey()}
                >
                  <Button danger disabled={weatherSaving}>清除密钥</Button>
                </Popconfirm>
              )}
              <Button
                loading={weatherTesting}
                disabled={
                  weatherSaving ||
                  (!townWeatherSettings?.apiKeyConfigured && !pendingWeatherApiKey?.trim())
                }
                onClick={() => void testTownWeatherConnection()}
              >
                测试两镇实况与预报
              </Button>
              <Button type="primary" htmlType="submit" loading={weatherSaving}>
                保存天气配置
              </Button>
            </Space>
          </div>
        </Form>
      </section>

      <section className="paper-card llm-governance-section">
        <div className="section-toolbar">
          <div>
            <h2>庄园 LLM 治理与审计</h2>
            <p>仅保存调用结果、Token、耗时和失败原因，不保存 Prompt、密钥或完整玩家状态。</p>
          </div>
          <Space>
            <Tag color={llmUsage?.circuit.open ? 'red' : 'green'}>
              {llmUsage?.circuit.open ? '熔断中' : '服务正常'}
            </Tag>
            <Button
              loading={llmUsageLoading}
              onClick={() => void onRefreshLlmUsage()}
            >
              刷新
            </Button>
          </Space>
        </div>

        <div className="admin-stats llm-governance-stats">
          <div className="paper-card">
            <span>24 小时调用</span>
            <strong>{llmUsage?.rolling24Hours.calls ?? 0}</strong>
          </div>
          <div className="paper-card">
            <span>成功</span>
            <strong>{llmUsage?.rolling24Hours.successes ?? 0}</strong>
          </div>
          <div className="paper-card">
            <span>回退 / 失败</span>
            <strong>
              {(llmUsage?.rolling24Hours.fallbacks ?? 0) +
                (llmUsage?.rolling24Hours.failures ?? 0)}
            </strong>
          </div>
          <div className="paper-card">
            <span>Token</span>
            <strong>
              {(llmUsage?.rolling24Hours.promptTokens ?? 0) +
                (llmUsage?.rolling24Hours.completionTokens ?? 0)}
            </strong>
          </div>
        </div>
        {llmUsage && (
          <p className="form-note">
            {`\u5355\u73a9\u5bb6\u6bcf\u65e5\u6700\u5927 ${llmUsage.policy.dailyCallLimitPerUser} \u6b21\u3001${llmUsage.policy.dailyTokenLimitPerUser.toLocaleString('zh-CN')} Token\uff1b\u8fde\u7eed\u5931\u8d25 ${llmUsage.policy.circuitFailureThreshold} \u6b21\u540e\u7194\u65ad ${Math.round(llmUsage.policy.circuitCooldownMs / 60_000)} \u5206\u949f\u3002`}
          </p>
        )}

        {llmUsage?.directorJobs && (
          <p className="form-note">
            {`\u6301\u4e45\u4efb\u52a1\u961f\u5217\uff1a\u5f85\u5904\u7406 ${llmUsage.directorJobs.counts.pending}\uff0c\u5904\u7406\u4e2d ${llmUsage.directorJobs.counts.processing}\uff0c\u5df2\u5e94\u7528 ${llmUsage.directorJobs.counts.applied}\uff0c\u5df2\u8fc7\u671f ${llmUsage.directorJobs.counts.obsolete}\uff0c\u5931\u8d25 ${llmUsage.directorJobs.counts.failed}\u3002`}
          </p>
        )}


        <Table<LlmDecisionAuditEntry>
          rowKey="id"
          columns={llmAuditColumns}
          dataSource={llmUsage?.recent ?? []}
          loading={llmUsageLoading}
          pagination={{
            current: llmAuditCurrent,
            pageSize: LLM_AUDIT_PAGE_SIZE,
            total: llmAuditTotal,
            showSizeChanger: false,
            showTotal: (total) => `共 ${total} 条调用记录`,
            onChange: (current) => setLlmAuditCurrentPage(current),
          }}
          scroll={{ x: 1_000 }}
          locale={{ emptyText: '暂无庄园 LLM 调用记录' }}
        />
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
          scroll={{ x: 840 }}
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
        title={`修改昵称${displayNameTarget ? ` · ${displayNameTarget.username}` : ''}`}
        open={Boolean(displayNameTarget)}
        onCancel={closeDisplayName}
        footer={null}
        destroyOnClose
      >
        <Form<DisplayNameValues>
          form={displayNameForm}
          layout="vertical"
          requiredMark={false}
          onFinish={changeDisplayName}
        >
          <Form.Item label="玩家昵称" name="displayName" rules={[{ required: true, message: '请输入玩家昵称' }, { max: 40 }] }>
            <Input maxLength={40} showCount autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>保存昵称</Button>
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
