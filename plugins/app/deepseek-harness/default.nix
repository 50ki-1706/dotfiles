{
  imports = [
    ./home
    ./homebrew
    # `dshPublish` を定義する dsh 本体側の plugin。デスクトップ版の
    # プロファイルにも `/publish` を入れるため、ここで参照する。
    ../../harness/deepseek-harness
  ];
  # `/publish` はクライアント非依存の dsh plugin なので、dsh 本体側
  # (plugins/harness/deepseek-harness) に置いてある。デスクトップ版でも
  # 同じツール群と `/publish` を使えるよう、ここで対象プロファイルを選ぶ。
  dshPublish.profiles = [ "desktop" ];
}
