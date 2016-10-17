'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from "path";
import * as fs from "fs";
import PreviewChangesProvider from "./previewChangesProvider";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    let fixImports = new FixImports();

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

    private _workspaceEdits: { [path: string]: vscode.WorkspaceEdit };
    private _textEdits: { [path: string]: vscode.TextEdit[] };
    private _oldLines: { [path: string]: string[] };
    private _previewUri = vscode.Uri.parse('changes-preview://authority/changes-preview');
    private _previewProvider: PreviewChangesProvider;

    constructor() {        
        // initialize preview
        this._previewProvider = new PreviewChangesProvider();
        vscode.workspace.registerTextDocumentContentProvider('changes-preview', this._previewProvider);
    }

    public fixImports(uri: vscode.Uri) {
        this._workspaceEdits = {};
        this._textEdits = {};
        this._oldLines = {};

        const isFolder = fs.lstatSync(uri.path).isDirectory();
        if (!isFolder) {
            this._textEdits[uri.path] = [];
            this._oldLines[uri.path] = [];
            vscode.workspace.openTextDocument(uri).then(document => {
                this.parseFile(document).then(() => this.createPreview());
            });
            
            return;
        }

        // it is a folder
        const folderPath = vscode.workspace.asRelativePath(uri);
        const pattern = `${folderPath}/**/*.*`;
        const findFilesPromise = vscode.workspace.findFiles(pattern, '**∕node_modules∕**', 0);

        findFilesPromise.then(files => {
            if (files.length > 200) {
                vscode.window.showWarningMessage("There is more than 200 files found. Are you sure you want to continue?", "Yes", "No, stop!").then((response) => {
                    if (response !== "Yes") {
                        return;
                    }

                    this.parseAllFiles(files);
                });
            } else {
                this.parseAllFiles(files);
            }
        });
    }

    private parseAllFiles(files: vscode.Uri[]) {
        vscode.window.showInformationMessage(`Parsing ${files.length} files. Please wait...`);
        const filePromises = files.map(file => {
            this._textEdits[file.path] = [];
            this._oldLines[file.path] = [];
            return vscode.workspace.openTextDocument(file).then(document => {
                return this.parseFile(document);
            });
        });

        Promise.all(filePromises).then(() => { 
            this.createPreview();
            vscode.window.showInformationMessage(`Successfully parsed ${filePromises.length} files.`);
        });
    }

    private parseFile(document: vscode.TextDocument) {
        let lines: vscode.TextLine[] = [];
        if (document.lineCount > 0) {
            for (var index = 0; index < document.lineCount; index++) {
                lines.push(document.lineAt(index));
            }
        }

        const linePromises = lines.map(line => {
            return this.parseLine(line, document);
        });

        return Promise.all(linePromises).then(() => {
            vscode.window.setStatusBarMessage(`Parsed ${document.fileName}`, 1000);
            this._workspaceEdits[document.uri.path] = new vscode.WorkspaceEdit();
            this._workspaceEdits[document.uri.path].set(document.uri, this._textEdits[document.uri.path]);
            vscode.workspace.applyEdit(this._workspaceEdits[document.uri.path]);
            document.save();
        });
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

        const pattern = `**/${pathArray[pathArray.length - 1]}.[jt]s*`;
        const findFilePromise = vscode.workspace.findFiles(pattern, '**∕node_modules∕**', 2);
        
        return findFilePromise.then(files => {
            // ignore ambiguous results
            if (files.length !== 1) {
                return null;
            }

            // find relative path
            const targetPath = files[0].path;
            const currentPath = document.uri.path;
            let relativePath = path.relative(currentPath, targetPath).replace(".", "").replace(/\\/g, "/");
            
            if (!relativePath) {
                return;
            }

            // remove extension
            relativePath = relativePath.substring(0, relativePath.lastIndexOf("."));

            // remove leading dot
            if (relativePath.startsWith("./../")) {
                relativePath = relativePath.substring(2, relativePath.length);
            }

            // if nothing changed
            if (relativePath === match[2]) {
                return;
            }

            //Replace last part of regex with relative path
            const newImportStatement = `import${match[1]}from "${relativePath}";`;
            const textEdit = new vscode.TextEdit(line.range, newImportStatement);
            this._textEdits[document.uri.path].push(textEdit);
            this._oldLines[document.uri.path].push(match[0]);
        });
    }

    private createPreview() {
        this._previewProvider.setTextEdits(this._textEdits, this._oldLines);
        this._previewProvider.update(this._previewUri);
        vscode.commands.executeCommand('vscode.previewHtml', this._previewUri, vscode.ViewColumn.Two, 'Review Changes');
    }

    dispose() {
        this._workspaceEdits = null;
        this._textEdits = null;
        this._oldLines = null;
    }
}