# 設定の変更・適用

設定の変更先は [ツール設定](../../modules/README.md) と [ホスト設定](../../hosts/README.md) を参照してください。

## 変更後の検証

Nix コードや Nix が読み込む設定を変更した場合は、[nix-verify](../../.agents/skills/nix-verify/SKILL.md) の順に整形・Home Manager ビルド・darwin ビルド・生成物確認を行います。出力先はそれぞれ `./result` と `./result-darwin` です。`docs/` 内だけの変更は対象外です。

Git ignore・VS Code 設定・グローバルスキルは、メインチェックアウトのファイルを直接参照します。配置済みなら編集内容が参照先に反映され、別 worktree をビルドしてもリンク先は変わりません。その他の設定やリンクの配置変更は、検証後に適用してください。

## 設定の適用

初回は [初期設定](../scripts/README.md#初期設定) のスクリプトを使います。初回適用はユーザー自身が確認して実行し、導入済みの nix-verify-gate による保護はありません。

```sh
# 初回（初期設定スクリプトから実行）
sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac

# 2回目以降
sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac
```

初回コマンドの直接実行は、未認識の `/etc/bashrc` または `/etc/zshrc` があると中止します。退避方法は [初期設定](../scripts/README.md#初期設定) を参照してください。

エージェントによる適用は、ユーザーの明示依頼があり、メインチェックアウト `/Users/koki/.dotfiles` の `main` で必要な検証を終えた場合に限ります。別ブランチ・worktree ではビルドまでとし、マージ後にメインチェックアウトで検証をやり直します。

## nix が見つからない場合

導入済みなら新しいログインシェルを開き、`command -v nix` で確認してください。見つからない場合は、Nix のインストール先とシェルの初期化設定を確認します。Nix が未導入なら [初期設定](../scripts/README.md#初期設定) に戻ります。
