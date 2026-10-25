'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { store, readJson, writeJsonAtomic } = require('./store');
const { paths } = require('./paths');
const { smartFetch } = require('./net');

const DEFAULT_CLIENT_ID = '00000000402b5328';
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf';
const AUTHORIZE_URL = 'https://login.live.com/oauth20_authorize.srf';
const TOKEN_URL = 'https://login.live.com/oauth20_token.srf';
const SCOPE = 'XboxLive.signin offline_access';

function clientId() {
  return store.getSettings().microsoftClientId || DEFAULT_CLIENT_ID;
}

function getAuthUrl(customClientId = '') {
  const params = new URLSearchParams({
    client_id: customClientId || clientId(),
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    prompt: 'select_account',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function accountsFile() {
  return path.join(paths.data(), 'accounts.json');
}

function loadAccounts() {
  const data = readJson(accountsFile(), { accounts: [] });
  return Array.isArray(data.accounts) ? data.accounts : [];
}

function saveAccounts(accounts) {
  writeJsonAtomic(accountsFile(), { version: 1, accounts });
  try {
    fs.chmodSync(accountsFile(), 0o600);
  } catch {
    // Windows ACL 不支持 chmod，忽略
  }
}

function offlineUuid(name) {
  const hash = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function offlineAuth(playerName) {
  const name = playerName || 'Steve';
  const uuid = offlineUuid(name);
  return {
    access_token: '0',
    client_token: uuid,
    uuid,
    name,
    user_properties: '{}',
    meta: { type: 'legacy', demo: false, clientId: '', xuid: '' },
    user_type: 'legacy',
  };
}

function publicAccount(account) {
  if (!account) return null;
  return {
    type: 'microsoft',
    name: account.name,
    uuid: account.uuid,
    xuid: account.xuid || '',
    skins: account.skins || [],
    capes: account.capes || [],
    loggedInAt: account.loggedInAt,
    expiresAt: account.expiresAt,
  };
}

function getPublicState() {
  const settings = store.getSettings();
  const accounts = loadAccounts();
  const account = accounts[0] || null;
  if (settings.accountMode === 'microsoft' && !account) {
    store.saveSettings({ accountMode: 'offline' });
    return {
      mode: 'offline',
      account: null,
      offlineName: settings.player.name,
      clientId: settings.microsoftClientId || DEFAULT_CLIENT_ID,
    };
  }
  const mode = settings.accountMode === 'microsoft' && account ? 'microsoft' : 'offline';
  return {
    mode,
    account: mode === 'microsoft' ? publicAccount(account) : null,
    offlineName: settings.player.name,
    clientId: settings.microsoftClientId || DEFAULT_CLIENT_ID,
  };
}

function getDisplayIdentity() {
  const state = getPublicState();
  if (state.mode === 'microsoft' && state.account) {
    return { mode: 'microsoft', name: state.account.name, uuid: state.account.uuid };
  }
  return { mode: 'offline', name: store.getSettings().player.name, uuid: offlineUuid(store.getSettings().player.name) };
}

async function parseResponse(response, context) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const detail = data.error_description || data.errorMessage || data.error || data.Message || response.statusText;
    const xerr = data.XErr ? `（Xbox 错误 ${data.XErr}）` : '';
    const error = new Error(`${context}失败：${detail || response.status}${xerr}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function postForm(body) {
  const response = await smartFetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': `TYCL Launcher/${require('../package.json').version}`,
    },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(30000),
  });
  return parseResponse(response, 'Microsoft 令牌交换');
}

async function postJson(url, body, context) {
  const response = await smartFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `TYCL Launcher/${require('../package.json').version}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  return parseResponse(response, context);
}

async function exchangeCode(code) {
  const data = await postForm({
    client_id: clientId(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  });
  if (!data.access_token) throw new Error('Microsoft 未返回 access_token');
  return data;
}

async function refreshMicrosoftToken(refreshToken) {
  const data = await postForm({
    client_id: clientId(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
    redirect_uri: REDIRECT_URI,
  });
  if (!data.access_token) throw new Error('Microsoft 刷新令牌失败');
  return data;
}

function xstsMessage(data) {
  const map = {
    2148916227: '该账户已被 Xbox Live 封禁。',
    2148916233: '该 Microsoft 账户没有 Xbox 账户，请先登录 minecraft.net 创建档案。',
    2148916235: '该账户所在地区不支持 Xbox Live。',
    2148916236: '该账户需要在 Xbox 页面完成成人验证。',
    2148916237: '该账户需要在 Xbox 页面完成成人验证。',
    2148916238: '该账户是未成年账户，需要由家庭组织者添加后才能登录。',
    2148916262: 'Xbox Live 暂时无法验证该账户，请稍后再试。',
  };
  return map[data.XErr] || data.Message || 'Xbox Live 验证失败';
}

async function authenticateWithXbox(msAccessToken) {
  const xbl = await postJson(
    'https://user.auth.xboxlive.com/user/authenticate',
    {
      Properties: {
        AuthMethod: 'RPS',
        SiteName: 'user.auth.xboxlive.com',
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT',
    },
    'Xbox Live 登录',
  );
  let xsts;
  try {
    xsts = await postJson(
      'https://xsts.auth.xboxlive.com/xsts/authorize',
      {
        Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
        RelyingParty: 'rp://api.minecraftservices.com/',
        TokenType: 'JWT',
      },
      'Xbox Live 验证',
    );
  } catch (error) {
    if (error.data && error.data.XErr) throw new Error(xstsMessage(error.data));
    throw error;
  }
  const userHash = xsts.DisplayClaims.xui[0].uhs;
  const xuid = xsts.DisplayClaims.xui[0].xid || '';
  const minecraft = await postJson(
    'https://api.minecraftservices.com/authentication/login_with_xbox',
    { identityToken: `XBL3.0 x=${userHash};${xsts.Token}` },
    'Minecraft 登录',
  );
  if (!minecraft.access_token) throw new Error('Minecraft 登录未返回访问令牌');
  return {
    accessToken: minecraft.access_token,
    expiresAt: Date.now() + (Number(minecraft.expires_in) || 86400) * 1000,
    xuid,
  };
}

async function fetchProfile(accessToken) {
  const response = await smartFetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': `TYCL Launcher/${require('../package.json').version}`,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('该 Microsoft 账户尚未拥有 Minecraft Java 版，或尚未创建 Minecraft 档案。');
    }
    if (response.status === 401) {
      throw new Error('Minecraft 登录已过期，请重新登录。');
    }
    throw new Error(`获取 Minecraft 档案失败（HTTP ${response.status}）`);
  }
  return response.json();
}

async function checkEntitlements(accessToken) {
  const response = await smartFetch('https://api.minecraftservices.com/entitlements/mcstore', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': `TYCL Launcher/${require('../package.json').version}`,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) return;
  const data = await response.json();
  if (Array.isArray(data.items) && data.items.length === 0) {
    throw new Error('该 Microsoft 账户没有 Minecraft Java 版的有效授权。');
  }
}

async function buildAccountFromMicrosoft(tokenData, previous = {}) {
  const auth = await authenticateWithXbox(tokenData.access_token);
  await checkEntitlements(auth.accessToken);
  const profile = await fetchProfile(auth.accessToken);
  const account = {
    type: 'microsoft',
    uuid: profile.id,
    name: profile.name,
    accessToken: auth.accessToken,
    expiresAt: auth.expiresAt,
    msRefreshToken: tokenData.refresh_token || previous.msRefreshToken || '',
    xuid: auth.xuid || previous.xuid || '',
    skins: profile.skins || [],
    capes: profile.capes || [],
    loggedInAt: previous.loggedInAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveAccounts([account]);
  store.saveSettings({ accountMode: 'microsoft' });
  return account;
}

async function loginWithCode(code) {
  const tokenData = await exchangeCode(code);
  return buildAccountFromMicrosoft(tokenData);
}

async function ensureMicrosoftAccount({ forceRefresh = false } = {}) {
  const accounts = loadAccounts();
  let account = accounts[0];
  if (!account) {
    const error = new Error('尚未登录 Microsoft 账户，请先在账户设置中登录正版账户。');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  if (!forceRefresh && account.expiresAt && account.expiresAt - 120000 > Date.now()) {
    return account;
  }
  if (!account.msRefreshToken) {
    const error = new Error('Microsoft 登录已过期，请重新登录正版账户。');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  let tokenData;
  try {
    tokenData = await refreshMicrosoftToken(account.msRefreshToken);
  } catch (refreshError) {
    const error = new Error('Microsoft 登录已过期，请重新登录正版账户。');
    error.code = 'AUTH_REQUIRED';
    error.cause = refreshError;
    throw error;
  }
  account = await buildAccountFromMicrosoft(tokenData, account);
  return account;
}

async function resolveLaunchAuth() {
  const settings = store.getSettings();
  if (settings.accountMode === 'microsoft') {
    const account = await ensureMicrosoftAccount();
    return {
      type: 'microsoft',
      name: account.name,
      uuid: account.uuid,
      authorization: {
        access_token: account.accessToken,
        client_token: account.uuid,
        uuid: account.uuid,
        name: account.name,
        user_properties: '{}',
        meta: { type: 'msa', demo: false, clientId: '', xuid: account.xuid || '' },
        user_type: 'msa',
      },
    };
  }
  const name = settings.player.name;
  return {
    type: 'offline',
    name,
    uuid: offlineUuid(name),
    authorization: offlineAuth(name),
  };
}

function logoutMicrosoft() {
  const accounts = loadAccounts();
  if (accounts.length) saveAccounts([]);
  store.saveSettings({ accountMode: 'offline' });
  return getPublicState();
}

function setOfflineMode() {
  store.saveSettings({ accountMode: 'offline' });
  return getPublicState();
}

module.exports = {
  DEFAULT_CLIENT_ID,
  REDIRECT_URI,
  getAuthUrl,
  loginWithCode,
  ensureMicrosoftAccount,
  getPublicState,
  getDisplayIdentity,
  resolveLaunchAuth,
  logoutMicrosoft,
  setOfflineMode,
  offlineUuid,
  offlineAuth,
  loadAccounts,
};
