import React, { useState, useEffect } from "react";
import { Lock, User, Plus, Trash2, ShieldCheck, Mail, Phone, BookOpen, LogOut, AlertCircle } from "lucide-react";

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
  const [stage, setStage] = useState("loading"); // loading | login | signup | app
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const [items, setItems] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tab, setTab] = useState("items");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyItem);
  const [contactForm, setContactForm] = useState({ name: "", relation: "", phone: "", line: "" });

  useEffect(() => {
    setStage("login");
  }, []);

  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState(null);
  const [sendStatus, setSendStatus] = useState({}); // contactId -> "sending" | "sent" | "error"

  async function sendTestSms(contact) {
    if (!contact.phone) return;
    setSendStatus((s) => ({ ...s, [contact.id]: "sending" }));

    // 電話番号を日本の国際表記(+81...)に変換
    let to = contact.phone.replace(/[-\s]/g, "");
    if (to.startsWith("0")) {
      to = "+81" + to.slice(1);
    }

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
        setSendStatus((s) => ({
          ...s,
          [contact.id]: "error:" + JSON.stringify(data.error || data),
        }));
      }
    } catch (e) {
      setSendStatus((s) => ({ ...s, [contact.id]: "error:" + e.message }));
    }
  }

  async function handleAuth(mode) {
    setAuthError("");
    if (!username.trim() || !password.trim()) {
      setAuthError("メールアドレスとパスワードを入力してください");
      return;
    }

    setLoading(true);
    try {
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

      // ユーザーデータ行を作成
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
      `${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${data.user.id}&select=items,contacts,alert_days`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${data.access_token}`,
        },
      }
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
    setContactForm({ name: "", relation: "", phone: "", line: "" });
  }

  function removeContact(id) {
    const next = contacts.filter((c) => c.id !== id);
    setContacts(next);
    syncData(items, next);
  }

  // ---------- styles ----------
  const page = {
    minHeight: "100vh",
    background: "#F6F1E7",
    color: "#26323A",
    fontFamily: "'Iowan Old Style','Georgia','Hiragino Mincho ProN',serif",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  if (stage === "loading") return <div style={page} />;

  if (stage === "login" || stage === "signup") {
    const isSignup = stage === "signup";
    return (
      <div style={{ ...page, justifyContent: "center", padding: 24 }}>
        <div
          style={{
            width: "100%",
            maxWidth: 380,
            background: "#FFFEFB",
            border: "1px solid #E3D9C6",
            borderRadius: 4,
            padding: "40px 32px",
            boxShadow: "0 1px 3px rgba(38,50,58,0.06)",
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div
              style={{
                width: 48,
                height: 48,
                margin: "0 auto 14px",
                borderRadius: "50%",
                background: "#26323A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BookOpen size={22} color="#F6F1E7" strokeWidth={1.5} />
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: 1 }}>
              のこす手紙
            </h1>
            <p style={{ fontSize: 13, color: "#7A8B6F", marginTop: 6, letterSpacing: 1 }}>
              デジタル遺産の引き継ぎノート
            </p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleAuth(isSignup ? "signup" : "login"); }}>
            <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6, letterSpacing: 1 }}>
              メールアドレス
            </label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3D9C6", borderRadius: 3, padding: "10px 12px", marginBottom: 16 }}>
              <User size={16} color="#A6A08C" style={{ marginRight: 8 }} />
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例: taro@example.com"
                style={{ border: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 15, background: "transparent" }}
              />
            </div>

            <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6, letterSpacing: 1 }}>
              パスワード
            </label>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3D9C6", borderRadius: 3, padding: "10px 12px", marginBottom: 8 }}>
              <Lock size={16} color="#A6A08C" style={{ marginRight: 8 }} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ border: "none", outline: "none", flex: 1, fontFamily: "inherit", fontSize: 15, background: "transparent" }}
              />
            </div>

            {authError && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: "#B5533C", marginTop: 8, marginBottom: 8 }}>
                <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: 16,
                padding: "12px 0",
                background: loading ? "#7A8B6F" : "#26323A",
                color: "#F6F1E7",
                border: "none",
                borderRadius: 3,
                fontSize: 14,
                letterSpacing: 2,
                fontFamily: "inherit",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <span style={{
                    width: 16, height: 16,
                    border: "2px solid #F6F1E7",
                    borderTop: "2px solid transparent",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 0.8s linear infinite",
                  }} />
                  {isSignup ? "作成中..." : "ログイン中..."}
                </>
              ) : (
                isSignup ? "アカウントを作成" : "ログイン"
              )}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </form>

          <p style={{ textAlign: "center", fontSize: 12, color: "#A6A08C", marginTop: 20 }}>
            {isSignup ? "すでにアカウントをお持ちですか？" : "はじめて利用しますか？"}{" "}
            <button
              onClick={() => { setAuthError(""); setStage(isSignup ? "login" : "signup"); }}
              style={{ background: "none", border: "none", color: "#5B7C8D", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
            >
              {isSignup ? "ログインへ" : "新規作成へ"}
            </button>
          </p>
        </div>

        <p style={{ fontSize: 11, color: "#A6A08C", marginTop: 24, maxWidth: 380, textAlign: "center", lineHeight: 1.7 }}>
          ※ これは試作版です。テスト用のメールアドレス・情報のみご入力ください。Supabaseの確認メールが届く場合があります。
        </p>
      </div>
    );
  }

  // ---------- main app ----------
  return (
    <div style={page}>
      <div style={{ width: "100%", maxWidth: 640, padding: "28px 20px 60px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: 1 }}>のこす手紙</h1>
            <p style={{ fontSize: 12, color: "#A6A08C", margin: "4px 0 0" }}>{currentUser} さんのノート</p>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #E3D9C6", borderRadius: 3, padding: "6px 12px", fontSize: 12, color: "#5B7C8D", cursor: "pointer", fontFamily: "inherit" }}
          >
            <LogOut size={13} /> ログアウト
          </button>
        </header>

        <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #E3D9C6" }}>
          {[
            { key: "items", label: "資産・サービス一覧" },
            { key: "contacts", label: "緊急連絡先" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: "none",
                border: "none",
                fontFamily: "inherit",
                fontSize: 14,
                padding: "8px 4px 12px",
                cursor: "pointer",
                color: tab === t.key ? "#26323A" : "#A6A08C",
                borderBottom: tab === t.key ? "2px solid #C9A227" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "items" && (
          <div>
            {items.length === 0 && !showForm && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#A6A08C", fontSize: 13 }}>
                まだ何も登録されていません。<br />銀行口座、サブスク、SNSなど、家族に伝えておきたいものから始めましょう。
              </div>
            )}

            {items.map((item) => {
              const meta = CATEGORY_META[item.category] || CATEGORY_META.other;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    background: "#FFFEFB",
                    border: "1px solid #E3D9C6",
                    borderLeft: `3px solid ${meta.color}`,
                    borderRadius: 3,
                    padding: "14px 16px",
                    marginBottom: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: meta.color, letterSpacing: 1, marginBottom: 4 }}>{meta.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{item.name}</div>
                    {item.account && <div style={{ fontSize: 12, color: "#7A8B6F", marginTop: 2 }}>{item.account}</div>}
                    {item.memo && <div style={{ fontSize: 12, color: "#A6A08C", marginTop: 4, whiteSpace: "pre-wrap" }}>{item.memo}</div>}
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    style={{ background: "none", border: "none", color: "#C9B8A0", cursor: "pointer", padding: 4 }}
                    aria-label="削除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}

            {showForm ? (
              <form
                onSubmit={addItem}
                style={{ background: "#FFFEFB", border: "1px solid #E3D9C6", borderRadius: 3, padding: 16, marginTop: 8 }}
              >
                <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>カテゴリ</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, background: "#fff" }}
                >
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>

                <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>サービス名・項目名</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="例: 三井住友銀行、Netflix、X(Twitter)"
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
                />

                <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>口座番号・ID等(任意)</label>
                <input
                  value={form.account}
                  onChange={(e) => setForm({ ...form, account: e.target.value })}
                  placeholder="例: 支店名・口座番号、登録メールアドレスなど"
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
                />

                <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>家族へのメモ(任意)</label>
                <textarea
                  value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="例: 解約はカスタマーセンターに電話。月額1,490円。"
                  rows={3}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 14, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box", resize: "vertical" }}
                />

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" style={{ flex: 1, padding: "10px 0", background: "#26323A", color: "#F6F1E7", border: "none", borderRadius: 3, fontSize: 13, letterSpacing: 1, fontFamily: "inherit", cursor: "pointer" }}>
                    保存する
                  </button>
                  <button type="button" onClick={() => { setShowForm(false); setForm(emptyItem); }} style={{ padding: "10px 16px", background: "none", border: "1px solid #E3D9C6", borderRadius: 3, fontSize: 13, color: "#7A8B6F", fontFamily: "inherit", cursor: "pointer" }}>
                    キャンセル
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 0", background: "none", border: "1px dashed #C9A227", borderRadius: 3, color: "#26323A", fontSize: 13, letterSpacing: 1, fontFamily: "inherit", cursor: "pointer", marginTop: 6 }}
              >
                <Plus size={15} /> 項目を追加する
              </button>
            )}
          </div>
        )}

        {tab === "contacts" && (
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#EFE7D8", border: "1px solid #E3D9C6", borderRadius: 3, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#5B7C8D", lineHeight: 1.7 }}>
              <ShieldCheck size={28} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                ここに登録した家族へ、もしもの時にSMSで通知します。30日間ログインがない場合、自動的に通知が送られます。
              </span>
            </div>

            {contacts.map((c) => (
              <div
                key={c.id}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", background: "#FFFEFB", border: "1px solid #E3D9C6", borderRadius: 3, padding: "14px 16px", marginBottom: 10 }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name} <span style={{ fontSize: 12, color: "#A6A08C", fontWeight: 400 }}>({c.relation})</span></div>
                  {c.phone && <div style={{ fontSize: 12, color: "#7A8B6F", marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}><Phone size={12} />{c.phone}</div>}
                  {c.line && <div style={{ fontSize: 12, color: "#7A8B6F", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><Mail size={12} />LINE: {c.line}</div>}
                  {c.phone && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => sendTestSms(c)}
                        disabled={sendStatus[c.id] === "sending"}
                        style={{
                          fontSize: 12,
                          padding: "6px 12px",
                          border: "1px solid #C9A227",
                          borderRadius: 3,
                          background: "none",
                          color: "#26323A",
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {sendStatus[c.id] === "sending" ? "送信中..." : "SMSテスト送信"}
                      </button>
                      {sendStatus[c.id] === "sent" && (
                        <span style={{ fontSize: 12, color: "#7A8B6F", marginLeft: 8 }}>送信しました</span>
                      )}
                      {typeof sendStatus[c.id] === "string" && sendStatus[c.id].startsWith("error") && (
                        <div style={{ fontSize: 11, color: "#B5533C", marginTop: 4, wordBreak: "break-all" }}>
                          {sendStatus[c.id]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => removeContact(c.id)} style={{ background: "none", border: "none", color: "#C9B8A0", cursor: "pointer", padding: 4 }} aria-label="削除">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}

            <form onSubmit={addContact} style={{ background: "#FFFEFB", border: "1px solid #E3D9C6", borderRadius: 3, padding: 16, marginTop: 8 }}>
              <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>名前</label>
              <input
                value={contactForm.name}
                onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                placeholder="例: 山田 花子"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
              />
              <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>関係</label>
              <input
                value={contactForm.relation}
                onChange={(e) => setContactForm({ ...contactForm, relation: e.target.value })}
                placeholder="例: 妻、長男"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
              />
              <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>電話番号(SMS用・任意)</label>
              <input
                value={contactForm.phone}
                onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                placeholder="例: 090-1234-5678"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 12, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
              />
              <label style={{ display: "block", fontSize: 12, color: "#5B7C8D", marginBottom: 6 }}>LINE ID(任意)</label>
              <input
                value={contactForm.line}
                onChange={(e) => setContactForm({ ...contactForm, line: e.target.value })}
                placeholder="例: hanako_yamada"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #E3D9C6", borderRadius: 3, marginBottom: 14, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
              />
              <button type="submit" style={{ width: "100%", padding: "10px 0", background: "#26323A", color: "#F6F1E7", border: "none", borderRadius: 3, fontSize: 13, letterSpacing: 1, fontFamily: "inherit", cursor: "pointer" }}>
                連絡先を追加
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
