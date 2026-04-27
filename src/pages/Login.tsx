import React, { useState } from "react";
import { auth } from "../lib/firebase";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { toast } from "../shared/ui/toast.js";
import { MESSAGES } from "../shared/constants/messages.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5174";

  // Kullanıcı varsa guard zaten yönlendirecek, burada navigate etmeye gerek yok
  // PublicRoute zaten kontrol ediyor

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        // Giriş yap
        await signInWithEmailAndPassword(auth, email, password);
        // Guard otomatik yönlendirecek, navigate gerekmez
      } else {
        // Kayıt ol
        await createUserWithEmailAndPassword(auth, email, password);
        // Guard otomatik yönlendirecek, navigate gerekmez
      }
    } catch (err: any) {
      toast.error(MESSAGES.ERROR_LOGIN_WITH_MESSAGE.replace('{message}', err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 320, margin: "80px auto", textAlign: "center" }}>
      <h2>{isLogin ? "Giriş Yap" : "Kayıt Ol"}</h2>
      <form onSubmit={(e) => { void handleSubmit(e); }}>
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
