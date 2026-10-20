# 設定の変更・適用

設定の変更先は [ツール設定](../../modules/README.md) と [ホスト設定](../../hosts/README.md) を参照してください。

## 設定の適用

初回は [初期設定](../scripts/README.md#初期設定) のスクリプトを使います。初回適用はユーザー自身が確認して実行し、導入済みの nix-verify-gate による保護はありません。

```sh
# 初回（初期設定スクリプトから実行）
sudo nix --extra-experimental-features nix-command --extra-experimental-features flakes run /Users/koki/.dotfiles#darwin-rebuild -- switch --flake /Users/koki/.dotfiles#mac

# 2回目以降
sudo darwin-rebuild switch --flake /Users/koki/.dotfiles#mac
```

初回コマンドの直接実行は、未認識の `/etc/bashrc` または `/etc/zshrc` があると中止します。退避方法は [初期設定](../scripts/README.md#初期設定) を参照してください。

設定変更後は [nix-verify](../../.agents/skills/nix-verify/SKILL.md) の順に整形・ビルド・生成物確認を行います。darwin 構成は、Home Manager の `./result` を残すため別の出力先を指定します。

```sh
nix build .#darwinConfigurations.mac.system --out-link result-darwin
```

エージェントによる適用は、ユーザーの明示依頼があり、メインチェックアウト `/Users/koki/.dotfiles` の `main` で必要な検証を終えた場合に限ります。

## nix が見つからない場合

`install.sh` の再実行は、Nix が未導入の場合に限ります。導入済みの設定変更には使いません。

適用後に見つからなければ、新しいシェルを開いてください。`/nix/var/nix/profiles/default/bin` が PATH に含まれる想定です（このマシンでの適用後の動作は未確認）。
