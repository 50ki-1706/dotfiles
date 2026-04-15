home-managerをビルドするときはnix経由で行なってください。

```sh
nix run home-manager -- switch --flake .#koki
```
