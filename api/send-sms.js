export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({ error: "to and message are required" });
  }

  const TWILIO_SID = process.env.TWILIO_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH;
  const TWILIO_FROM = process.env.TWILIO_FROM;

  const body = new URLSearchParams({
    To: to,
    From: TWILIO_FROM,
    Body: message,
  });

  try {
    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const data = await twilioRes.json();

    if (!twilioRes.ok) {
      return res.status(twilioRes.status).json({ error: data });
    }

    return res.status(200).json({ success: true, sid: data.sid });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
