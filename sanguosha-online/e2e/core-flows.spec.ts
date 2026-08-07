import { expect, test } from '@playwright/test';

test('registration, profile, project lobby, quick join, and estate action work end to end', async ({
  page,
  playwright,
}) => {
  const username = `e2e_${Date.now()}`;
  const password = 'e2e-password-2026';
  const updatedPassword = `${password}-updated`;

  await page.goto('/');
  await page.getByRole('button', { name: '使用邀请码注册' }).click();
  await page.getByPlaceholder('请输入邀请码').fill('invalid-code');
  await page.getByPlaceholder(/3–32 位/).fill(username);
  await page.getByPlaceholder('默认使用账号名').fill('端到端玩家');
  await page.getByPlaceholder('至少 8 位').fill(password);
  await page.getByPlaceholder('再次输入密码').fill(password);
  await page.getByRole('button', { name: '创建并登录' }).click();
  await expect(page.getByText('邀请码无效')).toBeVisible();

  await page.getByPlaceholder('请输入邀请码').fill('moyu2026');
  await page.getByRole('button', { name: '创建并登录' }).click();
  await expect(page.getByRole('heading', { name: '游戏大厅' })).toBeVisible();
  await expect(page.locator('.game-project-card')).toHaveCount(7);

  await page.getByRole('button', { name: '个人资料' }).click();
  await page.getByRole('textbox', { name: '昵称', exact: true }).fill('端到端玩家已更新');
  await page.getByRole('button', { name: '保存资料' }).click();
  await expect(page.getByText('端到端玩家已更新', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '修改密码' }).click();
  await page.getByLabel('当前密码').fill(password);
  await page.getByLabel('新密码', { exact: true }).fill(updatedPassword);
  await page.getByLabel('确认新密码').fill(updatedPassword);
  await page.getByRole('button', { name: '确认修改' }).click();
  await expect(page.getByText('密码已修改')).toBeVisible();

  const adminApi = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:4173',
  });
  try {
    const login = await adminApi.post('/api/auth/login', {
      data: { username: 'admin', password: 'moyu-local-2026' },
    });
    expect(login.ok()).toBeTruthy();
    const room = await adminApi.post('/api/rooms', {
      data: {
        name: '端到端快速加入房',
        gameType: 'gouji',
        maxPlayers: 6,
        botIntelligence: 3,
        botMode: 'rules',
      },
    });
    expect(room.status()).toBe(201);

    await page.getByRole('button', { name: '刷新房间' }).click();
    const goujiCard = page.locator('.game-project-card--gouji');
    await expect(goujiCard.getByText('端到端快速加入房')).toBeVisible();
    await expect(goujiCard.getByText('等待中 · 席位 1 / 6')).toBeVisible();
    await goujiCard.getByRole('button', { name: '快速加入' }).click();
    await expect(page.getByRole('heading', { name: '端到端快速加入房' })).toBeVisible();
    await page.getByRole('button', { name: '离开房间' }).click();
    await page.getByRole('button', { name: 'OK' }).click();
    await expect(page.getByRole('heading', { name: '游戏大厅' })).toBeVisible();
  } finally {
    await adminApi.dispose();
  }

  await page.getByRole('button', { name: '庄园' }).click();
  const weather = page.locator('#homestead-weather');
  await expect(weather).toBeVisible();
  await expect(weather).not.toContainText('郑州');
  await expect(weather).not.toContainText('拉萨');
  await expect(weather).not.toContainText('青禾镇');
  await page.getByRole('button', { name: '选择方案' }).first().click();
  await expect(page.getByText('世界事件已经处理')).toBeVisible();
  await expect(page.getByText(/队列 1/)).toHaveCount(0);
});
