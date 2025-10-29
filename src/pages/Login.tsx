import React, { useState } from "react";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        // Giriş yap
        await signInWithEmailAndPassword(auth, email, password);
        alert("✅ Giriş başarılı!");
      } else {
        // Kayıt ol
        await createUserWithEmailAndPassword(auth, email, password);
        alert("🎉 Kayıt başarılı!");
      }
    } catch (err: any) {
      alert("⚠️ Hata: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 320, margin: "80px auto", textAlign: "center" }}>
      <h2>{isLogin ? "Giriş Yap" : "Kayıt Ol"}</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="E-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 8, width: "100%", marginBottom: 10 }}
        />
        <input
          type="password"
          placeholder="Şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: 8, width: "100%", marginBottom: 10 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: 10, width: "100%", cursor: "pointer" }}
        >
          {loading ? "İşleniyor..." : isLogin ? "Giriş Yap" : "Kayıt Ol"}
        </button>
      </form>

      <p
        onClick={() => setIsLogin(!isLogin)}
        style={{ cursor: "pointer", color: "blue", marginTop: 12 }}
      >
        {isLogin ? "Hesabın yok mu? Kayıt ol" : "Zaten üye misin? Giriş yap"}
      </p>
    </div>
  );
}
