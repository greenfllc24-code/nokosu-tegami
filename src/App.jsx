import React, { useState } from "react";
import { Lock, User, Plus, Trash2, ShieldCheck, Phone, BookOpen, LogOut, AlertCircle } from "lucide-react";

const SUPABASE_URL = "https://dnkdowbkzvdxwykonykr.supabase.co";
const SUPABASE_KEY = "sb_publishable_FD9dp0hBBPABt0jVavGUIQ_RH56Lwr4";

const CATEGORY_META = {
  bank: { label: "銀行・証券", color: "#5B7C8D" },
  subscription: { label: "サブスク", color: "#C9A227" },
  sns: { label: "SNS", color: "#A0567D" },
  other: { label: "その他", color: "#7A8B6F" },
};

const emptyItem = { id: "", category: "bank", name: "", account: "", memo: "" };

export default function App() {
  const [stage, setStage] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [userId, setUserId] = useState(null);

  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tab, setTab] = useState("items");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyItem);
  const [contactForm, setContactForm] = useState({ name: "", relation: "", phone: "" });
  const [sendStatus, setSendStatus] = useState({});

  async function handleAuth(mode) {
    setAuthError("");
    if (!username.trim() || !password.trim()) {
      setAuthError("メールアドレスとパスワードを入力してください");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
          body: JSON.stringify({ email: username, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setAuthError(data.msg || data.error_description || "登録に失敗しました");
          return;
        }
        if (!data.access_token) {
          setAuthError("登録しました。確認メールをチェックしてからログインしてください");
          setStage("login");
          return;
        }
        setAccessToken(data.access_token);
        setUserId(data.user.id);
        await fetch(`${SUPABASE_URL}/rest/v1/user_data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${data.access_token}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ user_id: data.user.id, items: [], contacts: [] }),
        });
        setCurrentUser(username);
        setItems([]);
        setContacts([]);
        setStage("app");
        return;
      }

      // login
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
        body: JSON.stringify({ email: username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError("メールアドレスまたはパスワードが間違っています");
        return;
      }
      setAccessToken(data.access_token);
      setUserId(data.user.id);

      const rowRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${data.user.id}&select=items,contacts`,
        { headers: { apikey: SUPABASE_KEY, Authorization: Bearer ${data.access_token} } }
      );
      const rows = await rowRes.json();
      const row = rows && rows[0];

      // 最終ログイン日時を更新
      await fetch(`${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${data.user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${data.access_token}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ last_login: new Date().toISOString() }),
      });

      setCurrentUser(username);
      setItems(row?.items || []);
      setContacts(row?.contacts || []);
      setStage("app");
    } catch (e) {
      setAuthError("通信に失敗しました: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncData(nextItems, nextContacts) {
    if (!accessToken || !userId) return;
    await fetch(`${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ items: nextItems, contacts: nextContacts }),
    });
  }

  function handleLogout() {
    setAccessToken(null);
    setUserId(null);
    setCurrentUser(null);
    setUsername("");
    setPassword("");
    setItems([]);
    setContacts([]);
    setStage("login");
  }

  function addItem(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const next = [...items, { ...form, id: crypto.randomUUID() }];
    setItems(next);
    syncData(next, contacts);
    setForm(emptyItem);
    setShowForm(false);
  }

  function removeItem(id) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    syncData(next, contacts);
  }

  function addContact(e) {
    e.preventDefault();
    if (!contactForm.name.trim()) return;
    const next = [...contacts, { ...contactForm, id: crypto.randomUUID() }];
    setContacts(next);
    syncData(items, next);
    setContactForm({ name: "", relation: "", phone: "" });
  }

  function removeContact(id) {
    const next = contacts.filter((c) => c.id !== id);
    setContacts(next);
    syncData(items, next);
  }

  async function sendTestSms(contact) {
    if (!contact.phone) return;
    setSendStatus((s) => ({ ...s, [contact.id]: "sending" }));
    let to = contact.phone.replace(/[-\s]/g, "");
    if (to.startsWith("0")) to = "+81" + to.slice(1);
    try {
      const res = await fetch("/api/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          message: `【のこす手紙】${currentUser} さんの緊急連絡先として登録されています。これはテスト通知です。`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSendStatus((s) => ({ ...s, [contact.id]: "sent" }));
      } else {
        setSendStatus((s) => ({ ...s, [contact.id]: "error:" + JSON.stringify(data.error || data) }));
      }
    } catch (e) {
      setSendStatus((s) => ({ ...s, [contact.id]: "error:" + e.message }));
    }
  }

  const page = {
    minHeight: "100vh",
    background: "#F6F1E7",
    color: "#26323A",
    fontFamily: "'Iowan Old Style','Georgia','Hiragino Mincho ProN',serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  if (stage === "login" || stage === "signup") {
    const isSignup = stage === "signup";
    return (
      <div style={{ ...page, justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 380, background: "#FFFEFB", border: "1px solid #E3D9C6", borderRadius: 4, padding: "40px 32px", boxShadow: "0 1px 3px rgba(38,50,58,0.06)" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 48, height: 48, margin: "0 auto 14px", borderRadius: "50%", background: "#26323A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={22} color="#F6F1E7" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: 1 }}>のこす手紙</h1>
            <p style={{ fontSize: 13, color: "#7A8B6F", marginTop: 6, letterSpacing: 1 }}>デジタル遺産の引き継ぎノート</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleAuth(isSignup ? "signup" : "login"); }}>
            <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6, letterSpacing: 1 }}>メールアドレス</label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3D9C6", borderRadius: 3, padding: "10px 12px", marginBottom: 16 }}>
              <User size={16} color="#A6A08C" style={{ marginRight: 8 }} />
              <input type="email" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="例: taro@example.com"
                style={{ border: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 15, background: "transparent" }} />
            </div>

            <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6, letterSpacing: 1 }}>パスワード</label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3D9C6", borderRadius: 3, padding: "10px 12px", marginBottom: 8 }}>
              <Lock size={16} color="#A6A08C" style={{ marginRight: 8 }} />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                style={{ border: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 15, background: "transparent" }} />
            </div>

            {authError && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#B5533C", marginTop: 8, marginBottom: 8 }}>
                <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{authError}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: "100%", marginTop: 16, padding: "12px 0", background: loading ? "#7A8B6F" : "#26323A", color: "#F6F1E7", border: "none", borderRadius: 3, fontSize: 14, letterSpacing: 2, fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? (
                <>
                  <span style={{ width: 16, height: 1
