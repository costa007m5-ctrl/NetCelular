import { useState } from "react";

const template1 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;">
          <span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span>
        </td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">✉️</span></td></tr></table>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirme seu endereço de e-mail</h1>
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Obrigado por se cadastrar no <strong style="color:#ffffff;">NETPLAY</strong>! Para ativar sua conta e começar a assistir, confirme seu e-mail clicando no botão abaixo.</p>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Confirmar E-mail</a></td></tr></table>
            <p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;">O link expira em <strong style="color:#aaaaaa;">24 horas</strong>. Se você não criou uma conta no NETPLAY, pode ignorar este e-mail.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-top:1px solid #2a2a2a;"></td></tr></table>
            <p style="margin:0;font-size:12px;color:#555555;line-height:1.6;">Ou copie e cole este link:<br/><span style="color:#e50914;">https://netplay.app/auth/confirm?token=eyJhbGciOi...</span></p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0 0 8px;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const template2 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;"><span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span></td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">🔑</span></td></tr></table>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Redefinição de senha</h1>
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Recebemos uma solicitação para redefinir a senha da sua conta <strong style="color:#ffffff;">NETPLAY</strong>. Clique no botão abaixo para criar uma nova senha.</p>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Redefinir Senha</a></td></tr></table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="background-color:#1e1e1e;border-radius:8px;border-left:3px solid #e50914;padding:16px 20px;"><p style="margin:0;font-size:13px;color:#aaaaaa;line-height:1.6;">⚠️ Este link é válido por <strong style="color:#ffffff;">1 hora</strong>. Se você não solicitou a redefinição, sua senha permanece a mesma.</p></td></tr></table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td style="border-top:1px solid #2a2a2a;"></td></tr></table>
            <p style="margin:0;font-size:12px;color:#555555;">Ou copie e cole: <span style="color:#e50914;">https://netplay.app/auth/reset?token=eyJhbG...</span></p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const template3 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;"><span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span></td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">⚡</span></td></tr></table>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Seu link de acesso rápido</h1>
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Use o botão abaixo para entrar no <strong style="color:#ffffff;">NETPLAY</strong> instantaneamente, sem precisar de senha.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:10px;border:1px solid #2a2a2a;padding:20px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:1.5px;color:#666666;text-transform:uppercase;">Código de acesso</p><p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#e50914;font-family:'Courier New',monospace;">847291</p></td></tr></table>
            <p style="margin:0 0 20px;font-size:14px;color:#666666;text-align:center;">ou</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Entrar com Link Mágico</a></td></tr></table>
            <p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;text-align:center;">Expira em <strong style="color:#aaaaaa;">10 minutos</strong>. Não compartilhe.</p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const template4 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;"><span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span></td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">📧</span></td></tr></table>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirme seu novo e-mail</h1>
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Você solicitou a alteração do endereço de e-mail da sua conta <strong style="color:#ffffff;">NETPLAY</strong>. Clique abaixo para confirmar o novo endereço.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:8px;border:1px solid #2a2a2a;padding:16px 20px;"><p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:1px;color:#666666;text-transform:uppercase;">Novo e-mail</p><p style="margin:0;font-size:16px;color:#ffffff;font-weight:600;">novoemail@gmail.com</p></td></tr></table>
            <table cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Confirmar Novo E-mail</a></td></tr></table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td style="background-color:#1e1e1e;border-radius:8px;border-left:3px solid #e50914;padding:16px 20px;"><p style="margin:0;font-size:13px;color:#aaaaaa;line-height:1.6;">⚠️ O link expira em <strong style="color:#ffffff;">1 hora</strong>. Se não foi você, ignore este e-mail.</p></td></tr></table>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const template5 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;"><span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span></td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(180deg,#1a0000 0%,#141414 100%);padding:40px 40px 0;text-align:center;"><p style="margin:0 0 16px;font-size:48px;">🎬</p><h1 style="margin:0 0 12px;font-size:26px;font-weight:900;color:#ffffff;line-height:1.3;">Você foi convidado para o NETPLAY!</h1><p style="margin:0;font-size:16px;color:#aaaaaa;line-height:1.6;padding-bottom:32px;">Filmes, séries e muito mais — agora ao seu alcance.</p></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 40px 40px;">
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Um administrador do <strong style="color:#ffffff;">NETPLAY</strong> convidou você para criar uma conta. Clique no botão abaixo para aceitar o convite e definir sua senha.</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 28px;"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Aceitar Convite</a></td></tr></table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td width="33%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">🎥</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Filmes &amp; Séries</p></td><td width="4%"></td><td width="30%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">📱</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Qualquer Tela</p></td><td width="4%"></td><td width="29%" style="padding:12px;text-align:center;background:#1e1e1e;border-radius:8px;"><p style="margin:0 0 4px;font-size:20px;">🎭</p><p style="margin:0;font-size:11px;color:#aaaaaa;font-weight:600;">Múltiplos Perfis</p></td></tr></table>
            <p style="margin:0;font-size:13px;color:#666666;">O convite expira em <strong style="color:#aaaaaa;">24 horas</strong>.</p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const template6 = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:40px;"><span style="font-size:32px;font-weight:900;letter-spacing:-1px;color:#ffffff;">NET<span style="color:#e50914;">PLAY</span></span></td></tr>
        <tr><td style="background-color:#141414;border-radius:12px;overflow:hidden;">
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:linear-gradient(90deg,#e50914,#b00710);height:4px;"></td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 32px;">
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:50%;width:56px;height:56px;text-align:center;vertical-align:middle;padding:14px;"><span style="font-size:28px;">🛡️</span></td></tr></table>
            <h1 style="margin:0 0 12px;font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">Confirmação de identidade</h1>
            <p style="margin:0 0 28px;font-size:16px;color:#aaaaaa;line-height:1.6;">Para sua segurança, precisamos confirmar sua identidade antes de continuar com esta operação na sua conta <strong style="color:#ffffff;">NETPLAY</strong>.</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;"><tr><td style="background-color:#1e1e1e;border-radius:10px;border:1px solid #2a2a2a;padding:20px;text-align:center;"><p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:1.5px;color:#666666;text-transform:uppercase;">Código de verificação</p><p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#e50914;font-family:'Courier New',monospace;">591847</p></td></tr></table>
            <p style="margin:0 0 20px;font-size:14px;color:#666666;text-align:center;">ou</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:linear-gradient(135deg,#e50914,#c0000f);"><a href="#" style="display:inline-block;padding:14px 36px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.3px;">Verificar Identidade</a></td></tr></table>
            <p style="margin:28px 0 0;font-size:13px;color:#666666;line-height:1.6;text-align:center;">Expira em <strong style="color:#aaaaaa;">10 minutos</strong>. Não compartilhe este código.</p>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:32px 0 0;text-align:center;"><p style="margin:0;font-size:12px;color:#444444;">© 2025 NETPLAY. Todos os direitos reservados.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

const TEMPLATES = [
  { id: 1, label: "✉️ Confirmar Inscrição", html: template1 },
  { id: 2, label: "🔑 Redefinir Senha", html: template2 },
  { id: 3, label: "⚡ Link Mágico / OTP", html: template3 },
  { id: 4, label: "📧 Alterar E-mail", html: template4 },
  { id: 5, label: "🎬 Convidar Usuário", html: template5 },
  { id: 6, label: "🛡️ Reautenticação", html: template6 },
];

export default function EmailPreview() {
  const [active, setActive] = useState(0);

  return (
    <div style={{ display: "flex", height: "100vh", background: "#0a0a0a", fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 240, background: "#111", borderRight: "1px solid #222", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #222" }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: -0.5 }}>
            NET<span style={{ color: "#e50914" }}>PLAY</span>
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>Templates de E-mail</div>
        </div>
        <div style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
          {TEMPLATES.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActive(i)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                marginBottom: 4,
                borderRadius: 8,
                border: active === i ? "1px solid #e5091440" : "1px solid transparent",
                background: active === i ? "#e5091415" : "transparent",
                color: active === i ? "#fff" : "#888",
                fontSize: 13,
                fontWeight: active === i ? 600 : 400,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #222" }}>
          <div style={{ fontSize: 11, color: "#444", lineHeight: 1.5 }}>
            Preview com dados de exemplo. Os links são substituídos pelas variáveis do Supabase nos e-mails reais.
          </div>
        </div>
      </div>

      {/* Preview area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Top bar */}
        <div style={{
          padding: "12px 20px",
          borderBottom: "1px solid #1a1a1a",
          background: "#0d0d0d",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#e50914" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }} />
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }} />
          <div style={{
            flex: 1,
            background: "#1a1a1a",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 12,
            color: "#555",
            marginLeft: 8,
          }}>
            📧 {TEMPLATES[active].label.replace(/^.{2} /, "")} — NETPLAY
          </div>
          <div style={{ fontSize: 12, color: "#444" }}>Caixa de entrada</div>
        </div>

        {/* iframe */}
        <div style={{ flex: 1, overflow: "hidden", background: "#f4f4f5" }}>
          <iframe
            key={active}
            srcDoc={TEMPLATES[active].html}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
            sandbox="allow-same-origin"
            title={TEMPLATES[active].label}
          />
        </div>
      </div>
    </div>
  );
}
