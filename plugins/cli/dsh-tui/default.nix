{
  imports = [
    ./pnpm
    ./local
  ];
  # opendesign の tool_calls index 衝突への一時的な回避策は、クライアント
  # 非依存の修正なので dsh 本体側 (plugins/harness/deepseek-harness) に置いてある。
  # ここでは対象プロファイルを選ぶだけ。
  dshOpendesignToolcallShim.profiles = [ "dsh-tui" ];
  # `/publish` も同じく dsh 本体側の plugin。ここでは対象プロファイルを選ぶ。
  dshPublish.profiles = [ "dsh-tui" ];
}
