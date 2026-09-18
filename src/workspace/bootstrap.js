import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const authRoot = document.querySelector("#auth-root");
const form = document.querySelector("#auth-form");
const status = document.querySelector("#auth-status");
const submit = document.querySelector("#auth-submit");
const password = form.elements.password;
let mode = "login";
let workspaceStarted = false;

try {
  document.documentElement.dataset.theme =
    localStorage.getItem("workspace-theme") === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}

const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy
    ? mode === "reset"
      ? "正在更新…"
      : mode === "signup"
        ? "正在创建…"
        : "正在登录…"
    : mode === "reset"
      ? "设置新密码"
      : mode === "signup"
        ? "创建账号"
        : "登录工作区";
}

function setMode(next) {
  mode = next;
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const resetting = mode === "reset";
  const emailField = document.querySelector("#auth-email-field");
  emailField.hidden = resetting;
  form.elements.email.required = !resetting;
  password.autocomplete =
    mode === "login" ? "current-password" : "new-password";
  document.querySelector("#forgot-password").hidden = mode !== "login";
  setStatus("");
  setBusy(false);
}

async function startWorkspace(session) {
  if (workspaceStarted || !session?.user) return;
  workspaceStarted = true;
  window.__workspaceAuth = {
    client,
    user: session.user,
    namespace: new URL(SUPABASE_URL).hostname,
  };
  authRoot.hidden = true;
  document.querySelectorAll("[data-workspace]").forEach((node) => {
    node.hidden = false;
  });
  await import("./app.js");
}

document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.authMode));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  setStatus("");
  const values = new FormData(form);
  const email = String(values.get("email") || "").trim();
  const passwordValue = String(values.get("password") || "");
  try {
    if (mode === "reset") {
      const { data, error } = await client.auth.updateUser({
        password: passwordValue,
      });
      if (error) throw error;
      const { data: sessionData } = await client.auth.getSession();
      setStatus("密码已更新。");
      if (sessionData.session) await startWorkspace(sessionData.session);
      return;
    }
    const result =
      mode === "signup"
        ? await client.auth.signUp({
            email,
            password: passwordValue,
            options: { emailRedirectTo: `${location.origin}/workspace/` },
          })
        : await client.auth.signInWithPassword({
            email,
            password: passwordValue,
          });
    if (result.error) throw result.error;
    if (result.data.session) await startWorkspace(result.data.session);
    else setStatus("验证邮件已经发送，请完成验证后再登录。");
  } catch (error) {
    setStatus(error.message || "暂时无法完成登录，请稍后重试。", true);
  } finally {
    setBusy(false);
  }
});

document
  .querySelector("#forgot-password")
  .addEventListener("click", async () => {
    const email = String(form.elements.email.value || "").trim();
    if (!email) return setStatus("请先填写邮箱地址。", true);
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/workspace/`,
      });
      if (error) throw error;
      setStatus("重置邮件已经发送，请查看邮箱。");
    } catch (error) {
      setStatus(error.message || "重置邮件发送失败。", true);
    }
  });

client.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    setMode("reset");
    setStatus("请输入新的登录密码。");
  } else if (session) void startWorkspace(session);
  else if (event === "SIGNED_OUT" && workspaceStarted) location.reload();
});

const { data, error } = await client.auth.getSession();
if (error) setStatus("无法确认登录状态，请刷新后重试。", true);
else if (data.session) await startWorkspace(data.session);
