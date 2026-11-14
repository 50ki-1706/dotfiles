{
  imports = [
    ./nixpkgs
    # 一時的な回避策 (opendesign の tool_calls index 衝突)。既定ではどの
    # プロファイルにも入らず、dshOpendesignToolcallShim.profiles で選ぶ。
    ./opendesign-toolcall-shim
    # `/publish` と publish ツール群。既定ではどのプロファイルにも入らず、
    # dshPublish.profiles で選ぶ。
    ./publish
  ];
}
