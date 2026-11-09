{
  darwin =
    { ... }:
    {
      homebrew.casks = [ "koki/hanon-player/hanon-player" ];
      homebrew.taps = [
        {
          name = "koki/hanon-player";
          clone_target = "file:///Users/koki/Dev/mywork/eigo-no-hanon/homebrew-tap";
          trusted = true;
        }
      ];
    };
}
