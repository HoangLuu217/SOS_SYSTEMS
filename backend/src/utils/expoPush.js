/**
 * Tiện ích gửi thông báo đẩy (Push Notification) đến ứng dụng di động qua Expo Push Service
 */
async function sendExpoPushNotification({
  tokens,
  title,
  body,
  data = {},
  priority = 'high',
  sound = 'default',
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

  const messages = validTokens.map((token) => ({
    to: token,
    sound,
    title,
    body,
    priority: priority === 'CRITICAL' || priority === 'HIGH' ? 'high' : 'default',
    badge: 1,
    channelId: 'emergency-alerts',
    data: {
      ...data,
      timestamp: new Date().toISOString(),
    },
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    return { success: true, result };
  } catch (error) {
    console.error('Lỗi khi gửi Expo Push Notification:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendExpoPushNotification,
};
