{
  programs.vscode.keybindings = [
    {
      key = "ctrl+b p";
      command = "workbench.action.toggleSidebarVisibility";
      when = "isLinux";
    }
    {
      key = "cmd+b p";
      command = "workbench.action.toggleSidebarVisibility";
      when = "isMac";
    }
    {
      key = "ctrl+b s";
      command = "workbench.action.toggleAuxiliaryBar";
      when = "isLinux";
    }
    {
      key = "cmd+b s";
      command = "workbench.action.toggleAuxiliaryBar";
      when = "isMac";
    }
    {
      key = "ctrl+m d";
      command = "explorer.newFolder";
      when = "isLinux && explorerViewletVisible && filesExplorerFocus";
    }
    {
      key = "cmd+m d";
      command = "explorer.newFolder";
      when = "isMac && explorerViewletVisible && filesExplorerFocus";
    }
    {
      key = "ctrl+m f";
      command = "explorer.newFile";
      when = "isLinux && explorerViewletVisible && filesExplorerFocus";
    }
    {
      key = "cmd+m f";
      command = "explorer.newFile";
      when = "isMac && explorerViewletVisible && filesExplorerFocus";
    }
    {
      key = "ctrl+shift+j";
      command = "workbench.action.toggleMaximizedPanel";
      when = "isLinux";
    }
    {
      key = "cmd+shift+j";
      command = "workbench.action.toggleMaximizedPanel";
      when = "isMac";
    }
    {
      key = "ctrl+b t";
      command = "workbench.action.terminal.toggleTerminal";
      when = "isLinux && terminal.active";
    }
    {
      key = "cmd+b t";
      command = "workbench.action.terminal.toggleTerminal";
      when = "isMac && terminal.active";
    }
    {
      key = "ctrl+shift+[Quote]";
      command = "workbench.action.terminal.splitInActiveWorkspace";
      when = "isLinux";
    }
    {
      key = "cmd+shift+[Quote]";
      command = "workbench.action.terminal.splitInActiveWorkspace";
      when = "isMac";
    }
    {
      key = "ctrl+b a";
      command = "workbench.panel.chat";
      when = "isLinux && workbench.panel.chat.view.copilot.active";
    }
    {
      key = "cmd+b a";
      command = "workbench.panel.chat";
      when = "isMac && workbench.panel.chat.view.copilot.active";
    }
    {
      key = "ctrl+b o";
      command = "workbench.action.output.toggleOutput";
      when = "isLinux && workbench.panel.output.active";
    }
    {
      key = "cmd+b o";
      command = "workbench.action.output.toggleOutput";
      when = "isMac && workbench.panel.output.active";
    }
    {
      key = "shift+cmd+2";
      command = "workbench.action.quickOpenTerm";
      when = "true";
    }
    {
      key = "ctrl+alt+q";
      command = "-workbench.action.quit";
      when = "isLinux";
    }
    {
      key = "cmd+alt+q";
      command = "-workbench.action.quit";
      when = "isMac";
    }
    {
      key = "ctrl+shift+[";
      command = "workbench.action.previousEditor";
      when = "isLinux";
    }
    {
      key = "cmd+shift+[";
      command = "workbench.action.previousEditor";
      when = "isMac";
    }
  ];
}
