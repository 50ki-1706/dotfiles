{ mistral-vibe }:
mistral-vibe.overridePythonAttrs (old: {
  patches = (old.patches or [ ]) ++ [
    ./mistral-vibe-tests.patch
    ./mistral-vibe-fork.patch
  ];
})
