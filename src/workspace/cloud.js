// The database RPC uses an expected version; stale clients never overwrite silently.
export class CloudSync {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.user = null;
    this.status = "未连接";
    this.conflict = null;
    this.busy = false;
    this.timer = null;
    this.pending = false;
    this.client = null;
    this.namespace = "";
  }
  statusChanged(text) {
    this.status = text;
    this.callbacks.status();
  }
  async attach({ client, user, namespace }) {
    this.client = client;
    this.user = user;
    this.namespace = namespace;
    const local = await this.callbacks.switchUser(this.user, this.namespace);
    this.dirty = !!local?.dirty;
    await this.sync();
    this.interval = setInterval(() => {
      if (!document.hidden) this.sync();
    }, 30000);
  }
  schedule() {
    if (!this.user) return;
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 1200);
  }
  async remote() {
    const { data, error } = await this.client
      .from("personal_workspace")
      .select("payload,version")
      .eq("user_id", this.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async sync() {
    if (!this.user || this.conflict) return;
    if (this.busy) {
      this.pending = true;
      return;
    }
    this.busy = true;
    this.statusChanged("正在同步");
    try {
      if (!navigator.onLine) throw Error("离线，联网后重试");
      const remote = await this.remote();
      let local = this.callbacks.get();
      if (remote && remote.version !== local.baseRemote) {
        if (this.dirty) {
          this.conflict = remote;
          this.statusChanged("存在冲突，等待选择");
          return;
        }
        await this.callbacks.apply(remote.payload, remote.version);
        this.statusChanged("已同步");
        return;
      }
      if (!remote && !this.dirty) {
        this.statusChanged("云端尚无数据");
        return;
      }
      if (this.dirty) {
        local = this.callbacks.get();
        const { data, error } = await this.client.rpc(
          "save_personal_workspace",
          { expected_version: local.baseRemote, new_payload: local.state },
        );
        if (error) {
          if (error.message.includes("WORKSPACE_CONFLICT")) {
            this.conflict = await this.remote();
            this.statusChanged("存在冲突，等待选择");
            return;
          }
          throw error;
        }
        await this.callbacks.committed(Number(data), local.revision);
        this.dirty = this.callbacks.get().revision !== local.revision;
      }
      this.statusChanged(this.dirty ? "本机有新修改，待同步" : "已同步");
    } catch (error) {
      this.statusChanged("同步失败，本机内容保留");
      this.lastError = error.message;
      this.callbacks.notify("同步未完成：" + error.message);
    } finally {
      this.busy = false;
      if (this.pending) {
        this.pending = false;
        this.schedule();
      }
    }
  }
  async resolve(choice) {
    if (!this.conflict) return;
    const remote = await this.remote();
    if (choice === "remote") {
      await this.callbacks.apply(remote.payload, remote.version);
      this.dirty = false;
      this.conflict = null;
      this.statusChanged("已读取云端");
    } else {
      // Save the fetched cloud copy locally before an explicitly chosen replacement.
      const { putRecord } = await import("./storage.js");
      await putRecord("cloud-conflict:" + this.namespace + ":" + this.user.id, {
        at: new Date().toISOString(),
        remote,
      });
      const local = this.callbacks.get();
      const { data, error } = await this.client.rpc("save_personal_workspace", {
        expected_version: remote?.version || 0,
        new_payload: local.state,
      });
      if (error) throw error;
      await this.callbacks.committed(Number(data), local.revision);
      this.dirty = this.callbacks.get().revision !== local.revision;
      this.conflict = null;
      this.statusChanged("已同步");
    }
  }
  async logout() {
    if (this.busy) throw Error("正在同步，请稍后退出");
    clearTimeout(this.timer);
    clearInterval(this.interval);
    const { error } = await this.client.auth.signOut({ scope: "local" });
    if (error) throw error;
    this.user = null;
    this.conflict = null;
    this.statusChanged("已退出");
  }
  dispose() {
    clearTimeout(this.timer);
    clearInterval(this.interval);
  }
}
