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
      key = "ctrl+shift+g";
      command = "-workbench.view.scm";
      when = "isLinux && workbench.scm.active";
    }
    {
      key = "cmd+shift+g";
      command = "-workbench.view.scm";
      when = "isMac && workbench.scm.active";
    }
    {
      key = "ctrl+m d";
      command = "workbench.files.action.createFolderFromExplorer";
      when = "isLinux && view == 'workbench.explorer.fileView'";
    }
    {
      key = "cmd+m d";
      command = "workbench.files.action.createFolderFromExplorer";
      when = "isMac && view == 'workbench.explorer.fileView'";
    }
    {
      key = "ctrl+m f";
      command = "workbench.files.action.createFileFromExplorer";
      when = "isLinux && view == 'workbench.explorer.fileView'";
    }
    {
      key = "cmd+m f";
      command = "workbench.files.action.createFileFromExplorer";
      when = "isMac && view == 'workbench.explorer.fileView'";
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
      key = "ctrl+shift+[BracketLeft]";
      command = "-workbench.action.terminal.toggleTerminal";
      when = "isLinux && terminal.active";
    }
    {
      key = "cmd+shift+[BracketLeft]";
      command = "-workbench.action.terminal.toggleTerminal";
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
      key = "shift+cmd+[BracketRight]";
      command = "workbench.action.quickOpenTerm";
      when = "true";
    }
    {
      key = "alt+left";
      command = "workbench.action.previousEditor";
    }
    {
      key = "ctrl+pageup";
      command = "-workbench.action.previousEditor";
      when = "isLinux";
    }
    {
      key = "cmd+pageup";
      command = "-workbench.action.previousEditor";
      when = "isMac";
    }
    {
      key = "ctrl+alt+q";
      command = "-workbench.action.quit";
      when = "isLinux";
    }
    {
      key = "cmd+option+q";
      command = "-workbench.action.quit";
      when = "isMac";
    }
    {
      key = "ctrl+q";
      command = "workbench.action.closeFolder";
      when = "isLinux && emptyWorkspaceSupport && workbenchState != 'empty'";
    }
    {
      key = "cmd+q";
      command = "workbench.action.closeFolder";
      when = "isMac && emptyWorkspaceSupport && workbenchState != 'empty'";
    }
    {
      key = "ctrl+shift+[BracketLeft]";
      command = "workbench.action.quickOpenTerm";
      when = "terminalHasBeenCreated || terminalProcessSupported";
    }
  ];
}
