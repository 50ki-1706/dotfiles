{
  stdenvNoCC,
  nodejs,
  deepseek-harness,
}:
stdenvNoCC.mkDerivation {
  pname = "dsh-mistral-vibe-local";
  version = "1.0.0";
  src = ./.;
  nativeBuildInputs = [ nodejs ];
  dontBuild = true;
  postUnpack = ''
    ln -s ${deepseek-harness}/libexec/dsh/node_modules "$sourceRoot/node_modules"
  '';
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    node --test tests/*.test.js
    runHook postCheck
  '';
  installPhase = ''
    runHook preInstall
    mkdir -p "$out/share/dsh-mistral-vibe"
    cp package.json cordis.patch.yml README.md *.js "$out/share/dsh-mistral-vibe/"
    ln -s ${deepseek-harness}/libexec/dsh/node_modules "$out/share/dsh-mistral-vibe/node_modules"
    runHook postInstall
  '';
}
