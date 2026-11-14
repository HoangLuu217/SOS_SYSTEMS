const NORMAL_CHANNEL_ID = 'sos-normal-notifications';

function extractUserExpoTokens(userDoc) {
  if (!userDoc) return [];
  const candidates = [userDoc.pushToken, userDoc.citizen?.pushToken];
  const tokens = [];
  for (const raw of candidates) {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (
      trimmed &&
      (trimmed.startsWith('ExponentPushToken[') || trimmed.startsWith('ExpoPushToken[')) &&
      !tokens.includes(trimmed)
    ) {
      tokens.push(trimmed);
    }
  }
  return tokens;
}

/**
 * Gom tập Expo Push Token duy nhất và ánh xạ payload riêng từng token từ danh sách người dùng.
 * Cài đặt bật/tắt chi tiết được lưu và lọc trực tiếp trên ứng dụng (AsyncStorage).
 */
function collectExpoPushTargets(users, { buildTokenData } = {}) {
  const uniqueTokens = [];
  const dataByToken = {};

  (users || []).forEach((user) => {
    const tokens = extractUserExpoTokens(user);
    if (!tokens.length) return;

    const perUserData = typeof buildTokenData === 'function' ? buildTokenData(user) : null;

    tokens.forEach((token) => {
      if (!uniqueTokens.includes(token)) {
        uniqueTokens.push(token);
      }
      if (perUserData && !dataByToken[token]) {
        dataByToken[token] = perUserData;
      }
    });
  });

  return { uniqueTokens, dataByToken };
}

/**
 * Tiện ích gửi thông báo đẩy (Push Notification) đến ứng dụng di động qua Expo Push Service
 */
async function sendExpoPushNotification({
  tokens,
  title,
  body,
  data = {},
  dataByToken = {},
  priority = 'high',
  sound = 'default',
  channelId = NORMAL_CHANNEL_ID,
}) {
  if (!tokens || !tokens.length) {
    return { success: false, reason: 'No push tokens provided' };
  }

  // Lọc token hợp lệ của Expo
  const validTokens = tokens.filter(
    (t) =>
      typeof t === 'string' &&
      (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['))
  );

  if (!validTokens.length) {
    return { success: false, reason: 'No valid Expo push tokens found' };
  }

  const messages = validTokens.map((token) => {
    const isSilent = sound === null || sound === false || sound === undefined;
    const msg = {
      to: token,
      title,
      body,
      priority: priority === 'CRITICAL' || priority === 'HIGH' ? 'high' : 'default',
      badge: 1,
      channelId: channelId || NORMAL_CHANNEL_ID,
      data: {
        ...data,
        ...(dataByToken[token] || {}),
        timestamp: new Date().toISOString(),
      },
    };
    if (!isSilent) {
      msg.sound = sound;
    }
    return msg;
  });

  try {
    const results = [];
    for (let index = 0; index < messages.length; index += 100) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages.slice(index, index + 100)),
      });
      const result = await response.json();
      if (!response.ok) {
        return { success: false, status: response.status, result };
      }
      results.push(result);
    }
    return { success: true, result: results.flatMap((batch) => batch.data || []) };
  } catch (error) {
    console.error('Lỗi khi gửi Expo Push Notification:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  NORMAL_CHANNEL_ID,
  extractUserExpoTokens,
  collectExpoPushTargets,
  sendExpoPushNotification,
};
