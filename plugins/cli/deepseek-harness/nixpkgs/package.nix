{
  deepseek-harness,
  lib,
  nodejs_24,
}:
deepseek-harness.overrideAttrs (old: {
  postInstall = (old.postInstall or "") + ''
    wrapProgram "$out/bin/dsh" --prefix PATH : ${lib.makeBinPath [ nodejs_24 ]}
  '';
  meta = old.meta // {
    platforms = old.meta.platforms ++ [ "aarch64-darwin" ];
  };
})
