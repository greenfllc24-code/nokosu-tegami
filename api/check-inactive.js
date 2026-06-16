export default async function handler(req, res) {
  // Cronからのリクエストのみ許可
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const TWILIO_SID = process.env.TWILIO_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH;
  const TWILIO_FROM = process.env.TWILIO_FROM;

  try {
    // 全ユーザーのデータを取得(service keyで管理者権限)
    const res2 = await fetch(
      `${SUPABASE_URL}/rest/v1/user_data?select=user_id,last_login,alert_days,contacts`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );
    const users = await res2.json();

    const now = new Date();
    const results = [];

    for (const user of users) {
      const lastLogin = new Date(user.last_login);
      const diffDays = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
      const alertDays = user.alert_days || 30;

      if (diffDays >= alertDays) {
        // 緊急連絡先全員にSMS送信
        for (const contact of user.contacts || []) {
          if (!contact.phone) continue;

          let to = contact.phone.replace(/[-\s]/g, "");
          if (to.startsWith("0")) {
            to = "+81" + to.slice(1);
          }

          const body = new URLSearchParams({
            To: to,
            From: TWILIO_FROM,
            Body: `【のこす手紙】大切なお知らせです。${diffDays}日間ログインがありませんでした。${contact.name}さん、デジタル遺産の引き継ぎ情報をご確認ください。`,
          });

          await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization:
                  "Basic " +
                  Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64"),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body,
            }
          );

          results.push({ user_id: user.user_id, to, diffDays });
        }
      }
    }

    return res.status(200).json({ checked: users.length, notified: results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
