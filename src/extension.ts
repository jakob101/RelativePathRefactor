'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from "path";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let fixImports = new FixImports();

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "fiximports" is now active!');

    // The command has been defined in the package.json file
    // Now provide the implementation of the command with  registerCommand
    // The commandId parameter must match the command field in package.json
    let disposable = vscode.commands.registerCommand('extension.fixImports', (uri: vscode.Uri) => {
        // The code you place here will be executed every time your command is executed
        fixImports.fixImports(uri);
    });

    context.subscriptions.push(fixImports);
    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

const IMPORT_REGEX: RegExp = /import(.*)from[ ]+[\"|\'](.*)[\"|\']\;/i;

class FixImports {

    private _selectedItemUri: vscode.Uri;

    public fixImports(uri: vscode.Uri) {
        this._selectedItemUri = uri;

        // Access file
        const filePromise = vscode.workspace.openTextDocument(uri);

        // Parse file
        filePromise.then((document: vscode.TextDocument) => this.parseFile(document));
    }

    private parseFile(document: vscode.TextDocument) {
        if (document.lineCount > 0) {
            for (var index = 0; index < document.lineCount; index++) {
                var line = document.lineAt(index);
                this.parseLine(line, document);
            }
        }
    }

    private parseLine(line: vscode.TextLine, document: vscode.TextDocument) {
        const lineContents = line.text.trim();
        const match = lineContents.match(IMPORT_REGEX);

        if (!match || match.length > 3) {
            return;
        }

        // TODO: split by '\' if exists
        const pathArray = match[2].split('/');

        if (pathArray.length === 1) {
            return;
        }

        const pattern = `**/${pathArray[pathArray.length - 1]}.[jt]s?`;
        const findFilePromise = vscode.workspace.findFiles(pattern, '**∕node_modules∕**', 2);
        findFilePromise.then(files => {
            // ignore ambiguous results
            if (files.length !== 1) {
                return null;
            }

            // find relative path
            const targetPath = files[0].path;
            const currentPath = this._selectedItemUri.path;
            let relativePath = path.relative(currentPath, targetPath).replace(".", "").replace(/\\/g, "/") + "drek";
            
            // remove extension
            relativePath = relativePath.substring(0, relativePath.lastIndexOf("."));

            if (!relativePath) {
                return;
            }

            //Replace last part of regex with relative path
            const newImportStatement = `import${match[1]}from "${relativePath}";`;
            const lineTextEdit = new vscode.TextEdit(line.range, newImportStatement);
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, [lineTextEdit]);
            vscode.workspace.applyEdit(workspaceEdit);
            document.save();
            vscode.window.showInformationMessage('Success');
        });
    }

    dispose() {
        this._selectedItemUri = null;
    }
}