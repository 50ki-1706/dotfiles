{
  # ハーネス (dsh 本体) とその拡張。クライアント (app / cli) から独立させる。
  # dsh は desktop / web / dsh-tui / headless / ACP の各クライアントが共有する
  # 土台なので、特定クライアントの plugin の子には置かない。
  imports = [
    ./deepseek-harness
  ];
}
